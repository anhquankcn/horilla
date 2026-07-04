"""Nhận lượt chấm từ máy chấm công Ronald Jack (chấm công dự phòng).

Agent đặt tại VP đọc máy (pyzk) rồi POST batch punch về đây qua M2M token.
Mô hình: app GPS/selfie là CHÍNH, máy là DỰ PHÒNG → dedup theo cửa sổ thời gian
để không trùng với lượt chấm trên app. Mỗi punch ghi qua đúng luồng clock_in/clock_out
(tự chạy recompute_day → ALD26 span). Lượt máy gắn nguồn 'ronaljack', work_location
'in_office' (đã xác thực vân tay tại VP).
"""
import logging
from datetime import datetime

from django.utils import timezone as dj_tz
from django.utils.dateparse import parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from horilla_api.m2m_auth import M2MAuthentication, require_m2m_scope

logger = logging.getLogger(__name__)

DEDUP_SECONDS = 120  # bỏ qua punch máy nếu app/máy đã có lượt trong ±2 phút


def _secs(t):
    return t.hour * 3600 + t.minute * 60 + t.second if t else None


class BiometricPunchView(APIView):
    """POST: nhận batch lượt chấm từ máy Ronald Jack.

    Body: {"device_sn": "<serial>", "punches": [{"badge_id": "...", "timestamp": "2026-06-18T08:01:00+07:00"}]}
    Trả: {created, skipped_dup, unmatched: [badge_id...], errors}
    """

    authentication_classes = [M2MAuthentication]
    permission_classes = [require_m2m_scope("attendance:write")]

    def post(self, request):
        from employee.models import Employee
        from attendance.models import AttendanceActivity
        from attendance.methods.utils import Request as DeviceRequest
        from attendance.views.clock_in_out import clock_in, clock_out

        device_sn = str(request.data.get("device_sn") or "").strip()
        punches = request.data.get("punches") or []
        if not isinstance(punches, list):
            return Response({"error": "punches phải là mảng"}, status=400)

        created = skipped = 0
        unmatched = []
        errors = []
        ua = f"zk:{device_sn}" if device_sn else "zk:ronaljack"

        # cache badge → employee
        emp_cache = {}

        def get_emp(badge):
            if badge not in emp_cache:
                emp_cache[badge] = Employee.objects.filter(
                    badge_id=badge, is_active=True
                ).select_related("employee_user_id").first()
            return emp_cache[badge]

        for p in punches:
            badge = str(p.get("badge_id") or "").strip()
            raw_ts = p.get("timestamp")
            if not badge or not raw_ts:
                errors.append({"badge_id": badge, "error": "thiếu badge_id/timestamp"})
                continue
            ts = parse_datetime(raw_ts)
            if ts is None:
                errors.append({"badge_id": badge, "error": f"timestamp không hợp lệ: {raw_ts}"})
                continue
            if dj_tz.is_naive(ts):
                ts = dj_tz.make_aware(ts)

            emp = get_emp(badge)
            if not emp:
                unmatched.append(badge)
                continue

            d = ts.date()
            t = ts.time()
            day_acts = list(AttendanceActivity.objects.filter(
                employee_id=emp, attendance_date=d
            ))

            # DEDUP: app là chính — nếu đã có lượt (app hoặc máy) trong ±DEDUP_SECONDS → bỏ qua
            tsec = _secs(t)
            dup = any(
                pt is not None and abs(_secs(pt) - tsec) <= DEDUP_SECONDS
                for a in day_acts for pt in (a.clock_in, a.clock_out)
            )
            if dup:
                skipped += 1
                continue

            # in/out: còn activity mở (chưa clock_out) → punch này là clock_out, ngược lại clock_in
            open_act = next(
                (a for a in sorted(day_acts, key=lambda x: (x.in_datetime or x.id))
                 if a.clock_out is None), None
            )
            shim = DeviceRequest(user=emp.employee_user_id, date=d, time=t, datetime=ts)
            shim.is_headless = True  # clock_in/out trả HttpResponse, không render HTML
            try:
                if open_act:
                    clock_out(shim)
                else:
                    clock_in(shim)
            except Exception as e:
                logger.exception("biometric punch failed badge=%s", badge)
                errors.append({"badge_id": badge, "error": str(e)})
                continue

            # Gắn nguồn 'ronaljack' + work_location='in_office' cho lượt vừa ghi
            try:
                touched = AttendanceActivity.objects.filter(
                    employee_id=emp, attendance_date=d
                ).order_by("-id").first()
                if touched:
                    if open_act:  # vừa clock_out
                        touched.clock_out_device = "ronaljack"
                        touched.clock_out_user_agent = ua
                    else:  # vừa clock_in
                        touched.clock_in_device = "ronaljack"
                        touched.clock_in_user_agent = ua
                    touched.work_location = "in_office"
                    touched.save()
            except Exception:
                logger.exception("tag ronaljack source failed badge=%s", badge)

            created += 1

        return Response({
            "device_sn": device_sn,
            "received": len(punches),
            "created": created,
            "skipped_dup": skipped,
            "unmatched": sorted(set(unmatched)),
            "errors": errors,
        })
