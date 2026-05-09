"""
Custom OIDC backend for Horilla HRM.
Maps Keycloak users to existing Horilla users by email or username.
"""
import logging

from django.core.exceptions import SuspiciousOperation
from mozilla_django_oidc.auth import OIDCAuthenticationBackend
from mozilla_django_oidc.views import OIDCAuthenticationCallbackView

logger = logging.getLogger(__name__)


def generate_username(email):
    """Generate username from email (fallback)."""
    return email.split("@")[0]


class HorillaOIDCBackend(OIDCAuthenticationBackend):
    """
    Custom OIDC backend:
    - Tìm user Horilla theo email (primary — no hardcoded map needed)
    - Fallback: tìm theo KC preferred_username == Horilla username
    - Không tự tạo user mới (admin phải tạo trước)

    Admin creates the Horilla account first; Keycloak email must match.
    """

    def filter_users_by_claims(self, claims):
        email = claims.get("email", "")
        kc_username = claims.get("preferred_username", "")
        logger.warning(
            "OIDC login attempt — email=%r preferred_username=%r sub=%r",
            email, kc_username, claims.get("sub", ""),
        )

        # 1. Primary: match by email
        if email:
            users = self.UserModel.objects.filter(email=email, is_active=True)
            if users.exists():
                logger.warning("OIDC matched user by email: %r", email)
                return users

        # 2. Fallback: KC preferred_username == Horilla username (same convention)
        if kc_username:
            users = self.UserModel.objects.filter(username=kc_username, is_active=True)
            if users.exists():
                logger.warning("OIDC matched user by username: %r", kc_username)
                return users

        logger.warning("OIDC no matching user — email=%r username=%r", email, kc_username)
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
