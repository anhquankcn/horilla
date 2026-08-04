"""Thiết lập cá nhân của nhân viên (App Feature Thông báo → Cài đặt).

- GET  /api/employee/me/personal-settings/  → trạng thái 2 tuỳ chọn.
- PUT  /api/employee/me/personal-settings/  → cập nhật (partial: chỉ gửi field cần đổi).

Lưu tại HNHEmployeeProfile (OneToOne với Employee), tự tạo hồ sơ nếu chưa có.
"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from employee.models import HNHEmployeeProfile

FIELDS = ("allow_outside_office_checkin", "meeting_reminder_enabled", "clockout_notify_enabled")
BOOL_EXTRA = ("clock_reminder_enabled",)  # bool, xử lý cùng FIELDS
MAX_REMINDERS = 4


def _to_bool(v):
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("true", "1", "yes", "on")


def _clean_reminder_times(raw):
    """Chuẩn hoá danh sách mốc giờ nhắc chấm công.
    Quy tắc: mỗi mốc 'HH:MM', giờ 00-23, phút chia hết 10, tối đa 4 mốc.
    Trả (times_sorted, error) — error là str nếu không hợp lệ."""
    if raw is None:
        return None, None
    if not isinstance(raw, (list, tuple)):
        return None, "Danh sách mốc giờ không hợp lệ."
    out = []
    for item in raw:
        s = str(item).strip()
        if not s:
            continue
        parts = s.split(":")
        if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
            return None, f"Mốc giờ '{s}' sai định dạng (cần HH:MM)."
        h, m = int(parts[0]), int(parts[1])
        if not (0 <= h <= 23):
            return None, f"Giờ '{s}' phải trong khoảng 00–23."
        if m % 10 != 0:
            return None, f"Phút của '{s}' phải là 0 hoặc chia hết cho 10."
        out.append(f"{h:02d}:{m:02d}")
    out = sorted(set(out))
    if len(out) > MAX_REMINDERS:
        return None, f"Chỉ được đặt tối đa {MAX_REMINDERS} mốc nhắc chấm công."
    return out, None


class HNHPersonalSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def _employee(self, request):
        return getattr(request.user, "employee_get", None)

    def _profile(self, request):
        emp = self._employee(request)
        if emp is None:
            return None
        prof, _ = HNHEmployeeProfile.objects.get_or_create(employee_id=emp)
        return prof

    def _payload(self, prof):
        data = {f: getattr(prof, f) for f in FIELDS + BOOL_EXTRA}
        data["clock_reminder_times"] = list(prof.clock_reminder_times or [])
        return data

    def get(self, request):
        prof = self._profile(request)
        if prof is None:
            return Response({"detail": "Không có hồ sơ nhân viên"}, status=400)
        return Response(self._payload(prof))

    def put(self, request):
        prof = self._profile(request)
        if prof is None:
            return Response({"detail": "Không có hồ sơ nhân viên"}, status=400)
        changed = []
        for f in FIELDS + BOOL_EXTRA:
            if f in request.data:
                setattr(prof, f, _to_bool(request.data.get(f)))
                changed.append(f)
        if "clock_reminder_times" in request.data:
            times, err = _clean_reminder_times(request.data.get("clock_reminder_times"))
            if err:
                return Response({"detail": err}, status=400)
            prof.clock_reminder_times = times
            changed.append("clock_reminder_times")
        if changed:
            prof.save(update_fields=changed + ["updated_at"])
        return Response(self._payload(prof))
