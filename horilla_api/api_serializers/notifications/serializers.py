import json

from rest_framework import serializers

from notifications.models import Notification

# Thứ tự ưu tiên khi 1 thông báo gắn nhiều đơn (pool trừ nhiều dòng): còn 1 đơn
# 'requested' → xem như CHỜ; nếu không còn chờ mà có 'rejected' → TỪ CHỐI; ...
_STATUS_PRIORITY = ["requested", "rejected", "approved", "cancelled"]


def leave_ids_from_data(data):
    """Trích danh sách id đơn nghỉ từ trường data (dict hoặc chuỗi JSON)."""
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            return []
    if not isinstance(data, dict):
        return []
    raw = data.get("leave_request_ids") or []
    if isinstance(raw, (int, str)):
        raw = [raw]
    out = []
    for x in raw:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            pass
    return out


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
