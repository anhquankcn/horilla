import json
import logging
import re

from django.conf import settings
from pywebpush import webpush, WebPushException

from .models import PushSubscription

logger = logging.getLogger(__name__)


def _pwa_url(redirect: str = "", icon: str = "") -> str:
    """Map route Django (kwarg `redirect` của notify) → route PWA tuyệt đối
    (dưới /pwa/) để bấm vào push mở đúng màn trong app, khớp logic
    Notifications.tsx. Mọi url có tiền tố /pwa/ để SW mở trong PWA (không rơi
    về trang Django)."""
    r = (redirect or "").lower()
    if icon == "chatbubbles" or r in ("", "/"):
        return "/pwa/announcements"
    # Người duyệt: đơn nghỉ / cấp phép / chấm công cần duyệt
    if (
        ("/leave/request-view" in r and "/user-request-view" not in r)
        or "/leave/leave-allocation-request-view" in r
        or ("/attendance" in r and "request-view" in r)
    ):
        return "/pwa/approvals"
    if "/leave/user-request-view" in r or "/leave" in r:
        return "/pwa/proposals/leave"
    if "/attendance" in r:
        return "/pwa/attendance"
    return "/pwa/notifications"


def _clean_title(name: str) -> str:
    """Bỏ hậu tố '(mã)' ở tên NV để tiêu đề push gọn (str(Employee) kèm badge)."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", (name or "").strip()).strip() or "HNH HRM"


def send_web_push(user, title, body, url=None, require_interaction=False, tag=None):
    subscriptions = PushSubscription.objects.filter(user=user)
    if not subscriptions.exists():
        return

    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url or "/pwa/notifications",
        "requireInteraction": bool(require_interaction),
        # tag duy nhất mỗi lần đẩy → nhiều đơn không đè lên nhau trên màn khóa.
        "tag": tag or "",
    })

    vapid_claims = {
        "sub": f"mailto:{settings.VAPID_ADMIN_EMAIL}",
    }
    stale_ids = []

    for sub in subscriptions:
        sub_info = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
        }
        try:
            webpush(
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims=vapid_claims,
                # Urgency high → iOS/Android bung ngay lên màn khóa (không gộp/hoãn).
                # TTL 1 ngày → còn giữ nếu máy offline lúc gửi.
                ttl=86400,
                headers={"Urgency": "high"},
            )
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                stale_ids.append(sub.id)
            else:
                logger.warning("Web push failed for user %s: %s", user, e)
        except Exception as e:
            logger.warning("Web push error for user %s: %s", user, e)

    if stale_ids:
        PushSubscription.objects.filter(id__in=stale_ids).delete()


def on_notification_created(sender, **kwargs):
    from django.contrib.auth.models import Group
    from django.db.models.query import QuerySet

    recipient = kwargs.get("recipient")
    verb = str(kwargs.get("verb", ""))
    description = kwargs.get("description", "")
    redirect = kwargs.get("redirect", "") or ""
    icon = kwargs.get("icon", "") or ""

    body = description or verb
    url = _pwa_url(redirect, icon)
    # Đơn cần duyệt (màn approvals) → giữ trên màn khóa tới khi quản lý xử lý.
    require_interaction = url.endswith("/approvals")
    # Tiêu đề rõ trên màn khóa (body đã chứa tên NV + chi tiết). Với đơn duyệt
    # dùng tiêu đề hành động thay vì lặp tên NV.
    if require_interaction:
        title = "Đơn chờ duyệt"
    elif url.endswith("/announcements"):
        title = "Tin nội bộ"
    else:
        title = _clean_title(str(sender) if sender else "HNH HRM")

    if isinstance(recipient, Group):
        users = list(recipient.user_set.all())
    elif isinstance(recipient, (QuerySet, list)):
        users = list(recipient)
    else:
        users = [recipient]

    for user in users:
        if user is None:
            continue
        send_web_push(
            user, title=title, body=body, url=url,
            require_interaction=require_interaction,
        )
