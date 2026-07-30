"""
Custom OIDC backend for Horilla HRM.
Maps Keycloak users to existing Horilla users by email or username.
When no Horilla user matches a valid KC login, redirects to /oidc/signup/.
"""
import datetime
import logging
from urllib.parse import urljoin

import jwt as pyjwt
from django.conf import settings
from django.core.exceptions import SuspiciousOperation
from django.shortcuts import redirect
from mozilla_django_oidc import auth as oidc_auth
from mozilla_django_oidc import utils as oidc_utils
from mozilla_django_oidc import views as oidc_views
from mozilla_django_oidc.auth import OIDCAuthenticationBackend
from mozilla_django_oidc.views import OIDCAuthenticationCallbackView, OIDCAuthenticationRequestView

from horilla.horilla_middlewares import _thread_locals

logger = logging.getLogger(__name__)


def _patched_absolutify(request, path):
    """Use OIDC_REDIRECT_BASE_URL to build callback URL, avoiding port mismatch
    behind reverse proxies (Cloudflare → nginx:80 → Django sees port 80)."""
    base = getattr(settings, "OIDC_REDIRECT_BASE_URL", "")
    if base:
        return urljoin(base.rstrip("/") + "/", path.lstrip("/"))
    return request.build_absolute_uri(path)


oidc_utils.absolutify = _patched_absolutify
oidc_auth.absolutify = _patched_absolutify
oidc_views.absolutify = _patched_absolutify


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

    def _verify_jws(self, payload, key):
        """Allow up to 5 min clock skew between server and Keycloak."""
        jws = pyjwt.get_unverified_header(payload)
        alg = jws.get("alg")
        if not alg:
            raise SuspiciousOperation("No alg value found in header")
        if alg != self.OIDC_RP_SIGN_ALGO:
            raise SuspiciousOperation(
                f"The provider algorithm {alg!r} does not match OIDC_RP_SIGN_ALGO."
            )
        try:
            return pyjwt.decode(
                payload,
                key,
                algorithms=[alg],
                options={"verify_aud": False},
                leeway=datetime.timedelta(minutes=5),
            )
        except pyjwt.DecodeError:
            raise SuspiciousOperation("JWS token verification failed.")

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

        # 4. HNH — KC email → email công việc (EmployeeWorkInformation).
        # NV có User username kiểu vai trò cũ (admin3@, ca.sales1@…) nhưng danh
        # tính KC = email công việc. Chỉ khớp khi DUY NHẤT 1 NV active + User active.
        if email:
            from employee.models import EmployeeWorkInformation

            wis = list(
                EmployeeWorkInformation.objects.filter(
                    email__iexact=email, employee_id__is_active=True
                ).select_related("employee_id__employee_user_id")[:2]
            )
            if len(wis) == 1:
                cand = getattr(wis[0].employee_id, "employee_user_id", None)
                if cand and cand.is_active:
                    logger.warning("OIDC matched by work email: %r → %s", email, cand.username)
                    return self.UserModel.objects.filter(pk=cand.pk)

        logger.warning("OIDC no matching user — email=%r kc_username=%r", email, kc_username)
        # Signal to the callback view that signup is available for this KC identity
        _thread_locals.oidc_pending_claims = claims
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


class HorillaOIDCRequestView(OIDCAuthenticationRequestView):
    """Inject kc_idp_hint so Keycloak skips its own login page and goes
    directly to the requested Identity Provider (e.g. Microsoft).

    Usage: /oidc/authenticate/?idp=microsoft
    Keycloak IdP alias must match what is configured in KC admin → Identity Providers.
    """

    def get_extra_params(self, request):
        params = super().get_extra_params(request)
        idp = request.GET.get("idp", "").strip()
        if idp:
            params["kc_idp_hint"] = idp
        return params


class HorillaOIDCCallbackView(OIDCAuthenticationCallbackView):
    """
    Override:
    - Redirect to login (instead of 400) on state mismatch.
    - Redirect to /oidc/signup/ when KC auth succeeds but no Horilla user found.
    """

    @property
    def failure_url(self):
        return "/login/?sso_error=1"

    def login_failure(self):
        pending = getattr(_thread_locals, "oidc_pending_claims", None)
        if pending:
            _thread_locals.oidc_pending_claims = None
            self.request.session["oidc_pending_signup"] = {
                "email": pending.get("email", ""),
                "first_name": pending.get("given_name", ""),
                "last_name": pending.get("family_name", ""),
                "sub": pending.get("sub", ""),
                "preferred_username": pending.get("preferred_username", ""),
            }
            return redirect("/oidc/signup/")
        return super().login_failure()

    def get(self, request):
        try:
            return super().get(request)
        except SuspiciousOperation as exc:
            logger.warning("OIDC state mismatch — redirecting to login: %s", exc)
            _thread_locals.oidc_pending_claims = None
            return super().login_failure()
        except Exception as exc:
            logger.error("OIDC callback error: %s", exc, exc_info=True)
            raise
