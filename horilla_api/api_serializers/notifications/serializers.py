import json
import re

from rest_framework import serializers

from notifications.models import Notification

# id đơn nghỉ nhúng trong redirect kiểu '/leave/request-view?id=193' hoặc
# '/leave/user-request-view?id=193' (đều trỏ tới LeaveRequest).
_REDIRECT_ID_RE = re.compile(r"[?&]id=(\d+)")

# Thứ tự ưu tiên khi 1 thông báo gắn nhiều đơn (pool trừ nhiều dòng): còn 1 đơn
# 'requested' → xem như CHỜ; nếu không còn chờ mà có 'rejected' → TỪ CHỐI; ...
_STATUS_PRIORITY = ["requested", "rejected", "approved", "cancelled"]


def leave_ids_from_data(data):
    """Trích id đơn nghỉ (LeaveRequest) từ data — cả mảng `leave_request_ids`
    lẫn id nhúng trong `redirect` (/leave/request-view?id=N)."""
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            return []
    if not isinstance(data, dict):
        return []
    out = []
    raw = data.get("leave_request_ids") or []
    if isinstance(raw, (int, str)):
        raw = [raw]
    for x in raw:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            pass
    # Tin "Nhắc duyệt"/đơn nghỉ: id nằm trong redirect. Chỉ nhận view của
    # LeaveRequest (KHÔNG lấy allocation — model khác).
    redirect = data.get("redirect") or ""
    if isinstance(redirect, str) and (
        "/leave/request-view" in redirect or "/leave/user-request-view" in redirect
    ):
        m = _REDIRECT_ID_RE.search(redirect)
        if m:
            out.append(int(m.group(1)))
    # dedup giữ thứ tự
    return list(dict.fromkeys(out))


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    leave_status = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id", "level", "unread", "verb", "description",
            "timestamp", "deleted", "data", "actor_name", "leave_status",
        ]

    def get_actor_name(self, obj):
        if obj.actor:
            return str(obj.actor)
        return None

    def get_leave_status(self, obj):
        """Trạng thái HIỆN TẠI của đơn nghỉ liên quan (approved/rejected/
        requested/cancelled) để hiển thị badge; None nếu không phải tin đơn nghỉ."""
        ids = leave_ids_from_data(obj.data)
        if not ids:
            return None
        status_map = self.context.get("leave_status_map")
        if status_map is not None:
            statuses = [status_map[i] for i in ids if i in status_map]
        else:
            from leave.models import LeaveRequest
            statuses = list(
                LeaveRequest.objects.filter(id__in=ids).values_list("status", flat=True)
            )
        if not statuses:
            return None
        for st in _STATUS_PRIORITY:
            if st in statuses:
                return st
        return statuses[0]
