"""HNH Core M2M Authentication — 3-layer defense-in-depth.

Layer 1: Network — IP must be in allowed CIDRs (per-account or global)
Layer 2: Token  — X-HNH-Service-Token header, sha256 verified against DB
Layer 3: Scope  — endpoint declares required scope, account must have it

Usage in views:
    from horilla_api.m2m_auth import M2MAuthentication, require_m2m_scope

    class MyView(APIView):
        authentication_classes = [M2MAuthentication]
        permission_classes = [require_m2m_scope("employee:read")]
"""

import ipaddress
import logging

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission

from base.models import M2MServiceAccount

logger = logging.getLogger(__name__)

DEFAULT_TRUSTED_CIDRS = ["100.64.0.0/10", "172.16.0.0/12", "127.0.0.0/8", "::1/128"]

TOKEN_HEADER = "HTTP_X_HNH_SERVICE_TOKEN"
ALT_HEADER = "HTTP_AUTHORIZATION"
ALT_PREFIX = "ServiceToken "


def _get_client_ip(request):
    # Trong Docker, REMOTE_ADDR là IP proxy nội bộ. X-Real-IP (nginx set) đáng tin
    # hơn X-Forwarded-For (dễ giả mạo).
    #
    # Khi đi qua Cloudflare tunnel (cloudflared→nginx→web), IP THẬT của client nằm
    # ở header CF-Connecting-IP; X-Real-IP khi đó chỉ là gateway Docker (172.20.0.1).
    # Cloudflare LUÔN ghi đè CF-Connecting-IP bằng IP client thấy ở edge nên client
    # không giả mạo được qua đường public. Ta CHỈ tin CF-Connecting-IP khi hop tới
    # nginx là IP nội bộ Docker (tức đã qua cloudflared) — nếu ai đó hit thẳng nginx
    # qua Tailscale (peer 100.x) và gắn CF-Connecting-IP giả thì KHÔNG được tin.
    real_ip = (request.META.get("HTTP_X_REAL_IP") or "").strip()
    cf_ip = (request.META.get("HTTP_CF_CONNECTING_IP") or "").strip()
    if cf_ip and _ip_in_cidrs(real_ip, ["172.16.0.0/12"]):
        return cf_ip
    if real_ip:
        return real_ip
    return request.META.get("REMOTE_ADDR", "")


def _ip_in_cidrs(ip_str, cidrs):
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    for cidr in cidrs:
        try:
            if addr in ipaddress.ip_network(cidr, strict=False):
                return True
        except ValueError:
            continue
    return False


class M2MAuthentication(BaseAuthentication):
    """DRF authentication class for M2M service tokens."""

    def authenticate(self, request):
        raw_token = self._extract_token(request)
        if not raw_token:
            return None

        token_hash = M2MServiceAccount.hash_token(raw_token)

        try:
            account = M2MServiceAccount.objects.get(token_hash=token_hash)
        except M2MServiceAccount.DoesNotExist:
            raise AuthenticationFailed("Service token không hợp lệ")

        if account.status != "active":
            raise AuthenticationFailed("Service account đã bị thu hồi")

        # Layer 1: IP check — per-account CIDRs override global
        client_ip = _get_client_ip(request)
        if account.allowed_cidrs:
            cidrs = account.allowed_cidrs
        else:
            cidrs = getattr(settings, "M2M_TRUSTED_CIDRS", None) or DEFAULT_TRUSTED_CIDRS

        if not _ip_in_cidrs(client_ip, cidrs):
            logger.warning("M2M IP rejected: %s for account %s", client_ip, account.slug)
            raise AuthenticationFailed("Nguồn gọi không nằm trong dải mạng cho phép")

        # Throttle last_used update (max once per 60s per account)
        now = timezone.now()
        if not account.last_used_at or (now - account.last_used_at).total_seconds() > 60:
            M2MServiceAccount.objects.filter(pk=account.pk).update(
                last_used_at=now,
                last_used_ip=client_ip,
            )

        request.m2m_account = account
        return (None, account)

    def _extract_token(self, request):
        token = request.META.get(TOKEN_HEADER)
        if token:
            return token

        auth = request.META.get(ALT_HEADER, "")
        if auth.startswith(ALT_PREFIX):
            return auth[len(ALT_PREFIX):]

        return None


class M2MScopePermission(BasePermission):
    """Check that the M2M account has the required scope."""

    required_scope = ""

    def has_permission(self, request, view):
        account = getattr(request, "m2m_account", None)
        if not account:
            return False
        scope = getattr(view, "required_scope", self.required_scope)
        if not scope:
            return True
        return account.has_scope(scope)


def require_m2m_scope(scope: str):
    """Factory: returns a permission class requiring a specific scope."""
    return type(
        f"M2MScope_{scope.replace(':', '_')}",
        (M2MScopePermission,),
        {"required_scope": scope},
    )
