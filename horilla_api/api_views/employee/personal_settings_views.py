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


def _to_bool(v):
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("true", "1", "yes", "on")


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

    def get(self, request):
        prof = self._profile(request)
        if prof is None:
            return Response({"detail": "Không có hồ sơ nhân viên"}, status=400)
        return Response({f: getattr(prof, f) for f in FIELDS})

    def put(self, request):
        prof = self._profile(request)
        if prof is None:
            return Response({"detail": "Không có hồ sơ nhân viên"}, status=400)
        changed = []
        for f in FIELDS:
            if f in request.data:
                setattr(prof, f, _to_bool(request.data.get(f)))
                changed.append(f)
        if changed:
            prof.save(update_fields=changed + ["updated_at"])
        return Response({f: getattr(prof, f) for f in FIELDS})
