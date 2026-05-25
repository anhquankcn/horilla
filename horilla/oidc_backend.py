"""
Custom OIDC backend for Horilla HRM.
Maps Keycloak users to existing Horilla users by email or username.
"""
import logging
from urllib.parse import urljoin

from django.conf import settings
from django.core.exceptions import SuspiciousOperation
from mozilla_django_oidc import utils as oidc_utils
from mozilla_django_oidc.auth import OIDCAuthenticationBackend
from mozilla_django_oidc.views import OIDCAuthenticationCallbackView

logger = logging.getLogger(__name__)


def _patched_absolutify(request, path):
    """Use OIDC_REDIRECT_BASE_URL to build callback URL, avoiding port mismatch
    behind reverse proxies (Cloudflare → nginx:80 → Django sees port 80)."""
    base = getattr(settings, "OIDC_REDIRECT_BASE_URL", "")
    if base:
        return urljoin(base.rstrip("/") + "/", path.lstrip("/"))
    return request.build_absolute_uri(path)


oidc_utils.absolutify = _patched_absolutify


def generate_username(email):
    """Generate username from email (fallback)."""
    return email.split("@")[0]


class HorillaOIDCBackend(OIDCAuthenticationBackend):
    """
    Custom OIDC backend — matching priority:
    1. KC email  → Horilla email       (Microsoft SSO: email='quan.na@hnh.com')
    2. KC email  → Horilla username    (KC direct:    email='quan.na@hongngocha.com', username='quan.na@hongngocha.com')
    3. KC preferred_username → Horilla username  (fallback)

    Quy tắc setup user mới:
    - Horilla email   = email Microsoft (dùng cho Microsoft SSO identity)
    - Horilla username = email KC direct (dùng cho KC local identity)
    - Không tự tạo user — admin phải tạo trước.
    """

    def filter_users_by_claims(self, claims):
        email = claims.get("email", "")
        kc_username = claims.get("preferred_username", "")
        logger.warning(
            "OIDC login attempt — email=%r preferred_username=%r sub=%r",
            email, kc_username, claims.get("sub", ""),
        )

        if email:
            # 1. KC email → Horilla email (Microsoft SSO)
            users = self.UserModel.objects.filter(email=email, is_active=True)
            if users.exists():
                logger.warning("OIDC matched by email field: %r", email)
                return users

            # 2. KC email → Horilla username (KC direct local account)
            users = self.UserModel.objects.filter(username=email, is_active=True)
            if users.exists():
                logger.warning("OIDC matched by username=email: %r", email)
                return users

        # 3. KC preferred_username → Horilla username (fallback)
        if kc_username:
            users = self.UserModel.objects.filter(username=kc_username, is_active=True)
            if users.exists():
                logger.warning("OIDC matched by preferred_username: %r", kc_username)
                return users

        logger.warning("OIDC no matching user — email=%r kc_username=%r", email, kc_username)
        return self.UserModel.objects.none()

    def create_user(self, claims):
        """Không tự tạo user — admin phải tạo tài khoản Horilla trước."""
        return None

    def update_user(self, user, claims):
        """Cập nhật thông tin user từ KC nếu cần."""
        kc_first = claims.get("given_name", "")
        kc_last = claims.get("family_name", "")
        if kc_first and not user.first_name:
            user.first_name = kc_first
        if kc_last and not user.last_name:
            user.last_name = kc_last
        user.save()
        return user


class HorillaOIDCCallbackView(OIDCAuthenticationCallbackView):
    """Override: redirect to login instead of 400 on state mismatch."""

    @property
    def failure_url(self):
        return "/login/"

    def get(self, request):
        try:
            return super().get(request)
        except SuspiciousOperation as exc:
            logger.warning("OIDC state mismatch — redirecting to login: %s", exc)
            return self.login_failure()
        except Exception as exc:
            logger.error("OIDC callback error: %s", exc, exc_info=True)
            raise
