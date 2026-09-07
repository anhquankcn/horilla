"""Nhận lượt chấm từ máy chấm công Ronald Jack (chấm công dự phòng).

Agent đặt tại VP đọc máy (pyzk) rồi POST batch punch về đây qua M2M token.
Mô hình: app GPS/selfie là CHÍNH, máy là DỰ PHÒNG → dedup theo cửa sổ thời gian
để không trùng với lượt chấm trên app. Mỗi punch ghi qua đúng luồng clock_in/clock_out
(tự chạy recompute_day → ALD26 span). Lượt máy gắn nguồn 'ronaljack', work_location
'in_office' (đã xác thực vân tay tại VP).

Ánh xạ User ID máy → Employee: Horilla là NGUỒN DUY NHẤT (BiometricDeviceMapping),
gateway gửi thẳng User ID thô, KHÔNG tự dịch. Trước đây việc dịch nằm ở file
badge_map.json trên máy gateway (phải SSH sửa tay). User ID chưa có mapping →
lưu tạm vào BiometricPendingPunch, C&B tự map qua App Feature "Chấm công chưa
khớp" (xem BiometricPendingListView/BiometricPendingMapView).
"""
import logging

from django.utils import timezone as dj_tz
from django.utils.dateparse import parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from horilla_api.m2m_auth import M2MAuthentication, require_m2m_scope

logger = logging.getLogger(__name__)

DEDUP_SECONDS = 120  # bỏ qua punch máy nếu app/máy đã có lượt trong ±2 phút


def _secs(t):
    return t.hour * 3600 + t.minute * 60 + t.second if t else None


def _is_cnb(user):
    if user.is_superuser:
        return True
    gnames = [g.name.lower() for g in user.groups.all()]
    return any(
        "c&b" in g or "c & b" in g or "chuyên viên c" in g or "cb" == g.strip()
        for g in gnames
    )


def write_punch(emp, ts, device_sn, ua):
    """Ghi 1 punch (đã xác định employee) qua đúng luồng clock_in/clock_out của
    app — dùng chung cho BiometricPunchView (luồng tự động) và
    BiometricPendingMapView (C&B map tay, xử lý bù các lượt tồn đọng).

    Trả 'created' | 'skipped_dup', raise Exception nếu clock_in/out lỗi.
    """
    from attendance.models import AttendanceActivity
    from attendance.methods.utils import Request as DeviceRequest
    from attendance.views.clock_in_out import clock_in, clock_out

    d = ts.date()
    t = ts.time()
    day_acts = list(AttendanceActivity.objects.filter(employee_id=emp, attendance_date=d))

    # DEDUP: app là chính — nếu đã có lượt (app hoặc máy) trong ±DEDUP_SECONDS → bỏ qua
    tsec = _secs(t)
    dup = any(
        pt is not None and abs(_secs(pt) - tsec) <= DEDUP_SECONDS
        for a in day_acts for pt in (a.clock_in, a.clock_out)
    )
    if dup:
        return "skipped_dup"

    # in/out: còn activity mở (chưa clock_out) → punch này là clock_out, ngược lại clock_in
    open_act = next(
        (a for a in sorted(day_acts, key=lambda x: (x.in_datetime or x.id)) if a.clock_out is None),
        None,
    )
    shim = DeviceRequest(user=emp.employee_user_id, date=d, time=t, datetime=ts)
    shim.is_headless = True  # clock_in/out trả HttpResponse, không render HTML
    if open_act:
        clock_out(shim)
    else:
        clock_in(shim)

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
        logger.exception("tag ronaljack source failed emp=%s", emp.id)

    return "created"


class BiometricPunchView(APIView):
    """POST: nhận batch lượt chấm từ máy Ronald Jack.

    Body: {"device_sn": "<serial>", "punches": [{"badge_id": "<User ID trên máy>", "timestamp": "..."}]}
    Trả: {created, skipped_dup, unmatched: [device_user_id...], errors}

    "badge_id" trong body là tên field lịch sử (giữ để không phải sửa gateway) —
    thực chất là User ID THÔ trên máy, không phải badge_id Horilla.
    """

    authentication_classes = [M2MAuthentication]
    permission_classes = [require_m2m_scope("attendance:write")]

    def post(self, request):
        from employee.models import Employee
        from attendance.models import BiometricDeviceMapping, BiometricPendingPunch

        device_sn = str(request.data.get("device_sn") or "").strip()
        punches = request.data.get("punches") or []
        if not isinstance(punches, list):
            return Response({"error": "punches phải là mảng"}, status=400)

        created = skipped = ignored_count = 0
        unmatched = []
        errors = []
        ua = f"zk:{device_sn}" if device_sn else "zk:ronaljack"

        # cache tra cứu trong batch — tránh query lặp lại cùng 1 user_id nhiều lần
        emp_cache = {}
        mapping_cache = {}

        def resolve(user_id):
            """User ID máy → (employee | None, ignored: bool)."""
            if user_id in emp_cache:
                return emp_cache[user_id]
            # 1. Thử khớp trực tiếp badge_id Horilla (phòng khi User ID máy == badge_id thật)
            emp = Employee.objects.filter(
                badge_id=user_id, is_active=True
            ).select_related("employee_user_id").first()
            if emp:
                result = (emp, False)
            else:
                # 2. Tra BiometricDeviceMapping do C&B đã map qua App Feature
                if user_id not in mapping_cache:
                    mapping_cache[user_id] = BiometricDeviceMapping.objects.filter(
                        device_sn=device_sn, device_user_id=user_id
                    ).select_related("employee_id__employee_user_id").first()
                m = mapping_cache[user_id]
                if m and m.ignored:
                    result = (None, True)
                elif m and m.employee_id and m.employee_id.is_active:
                    result = (m.employee_id, False)
                else:
                    result = (None, False)
            emp_cache[user_id] = result
            return result

        for p in punches:
            user_id = str(p.get("badge_id") or "").strip()
            raw_ts = p.get("timestamp")
            if not user_id or not raw_ts:
                errors.append({"badge_id": user_id, "error": "thiếu badge_id/timestamp"})
                continue
            ts = parse_datetime(raw_ts)
            if ts is None:
                errors.append({"badge_id": user_id, "error": f"timestamp không hợp lệ: {raw_ts}"})
                continue
            if dj_tz.is_naive(ts):
                ts = dj_tz.make_aware(ts)

            emp, is_ignored = resolve(user_id)
            if is_ignored:
                ignored_count += 1
                continue
            if not emp:
                # Lưu tạm để C&B map tay sau — get_or_create tránh nhân đôi khi
                # gateway gửi lại (agent chỉ đẩy mốc sau khi upload HTTP thành
                # công, KHÔNG theo từng punch matched hay chưa).
                BiometricPendingPunch.objects.get_or_create(
                    device_sn=device_sn, device_user_id=user_id, punch_at=ts,
                )
                unmatched.append(user_id)
                continue

            try:
                outcome = write_punch(emp, ts, device_sn, ua)
            except Exception as e:
                logger.exception("biometric punch failed user_id=%s", user_id)
                errors.append({"badge_id": user_id, "error": str(e)})
                continue

            if outcome == "skipped_dup":
                skipped += 1
            else:
                created += 1

        return Response({
            "device_sn": device_sn,
            "received": len(punches),
            "created": created,
            "skipped_dup": skipped,
            "ignored": ignored_count,
            "unmatched": sorted(set(unmatched)),
            "errors": errors,
        })


class BiometricPendingListView(APIView):
    """GET /api/attendance/biometric-pending/ — danh sách User ID máy chấm công
    CHƯA map, gom nhóm (device_sn, device_user_id), kèm số lượt tồn đọng +
    thời điểm sớm/muộn nhất. Chỉ C&B/admin xem được.
    """

    permission_classes = []  # tự kiểm C&B bên dưới (giống pattern leave_management_views)

    def get(self, request):
        if not request.user.is_authenticated or not _is_cnb(request.user):
            return Response({"error": "Chỉ C&B mới xem được"}, status=403)

        from django.db.models import Count, Min, Max
        from attendance.models import BiometricPendingPunch

        rows = (
            BiometricPendingPunch.objects.values("device_sn", "device_user_id")
            .annotate(count=Count("id"), first_seen=Min("punch_at"), last_seen=Max("punch_at"))
            .order_by("-last_seen")
        )
        return Response({
            "results": [
                {
                    "device_sn": r["device_sn"],
                    "device_user_id": r["device_user_id"],
                    "count": r["count"],
                    "first_seen": r["first_seen"].isoformat(),
                    "last_seen": r["last_seen"].isoformat(),
                }
                for r in rows
            ],
        })


class BiometricPendingMapView(APIView):
    """POST /api/attendance/biometric-pending/map/ — C&B gán 1 User ID máy cho
    1 nhân viên (hoặc đánh dấu bỏ qua), rồi xử lý bù toàn bộ lượt đang tồn đọng
    của User ID đó thành chấm công thật.

    Body: {"device_sn", "device_user_id", "employee_id"} — gán nhân viên
       hoặc: {"device_sn", "device_user_id", "ignore": true} — bỏ qua (ID rác)
    """

    permission_classes = []

    def post(self, request):
        if not request.user.is_authenticated or not _is_cnb(request.user):
            return Response({"error": "Chỉ C&B mới thao tác được"}, status=403)

        from employee.models import Employee
        from attendance.models import BiometricDeviceMapping, BiometricPendingPunch

        device_sn = str(request.data.get("device_sn") or "").strip()
        user_id = str(request.data.get("device_user_id") or "").strip()
        ignore = bool(request.data.get("ignore"))
        employee_id = request.data.get("employee_id")

        if not device_sn or not user_id:
            return Response({"error": "Thiếu device_sn/device_user_id"}, status=400)
        if not ignore and not employee_id:
            return Response({"error": "Cần employee_id hoặc ignore=true"}, status=400)

        emp = None
        if not ignore:
            emp = Employee.objects.filter(id=employee_id, is_active=True).select_related(
                "employee_user_id"
            ).first()
            if not emp:
                return Response({"error": "Không tìm thấy nhân viên"}, status=404)

        mapping, _ = BiometricDeviceMapping.objects.update_or_create(
            device_sn=device_sn, device_user_id=user_id,
            defaults={
                "employee_id": emp,
                "ignored": ignore,
                "created_by": request.user,
            },
        )

        pending = list(
            BiometricPendingPunch.objects.filter(device_sn=device_sn, device_user_id=user_id)
            .order_by("punch_at")
        )
        created = skipped = 0
        errors = []
        failed_ids = []  # pending giữ lại (lỗi) — thử lại lần map/gán kế tiếp
        ua = f"zk:{device_sn}" if device_sn else "zk:ronaljack"
        if emp:
            for pp in pending:
                try:
                    outcome = write_punch(emp, pp.punch_at, device_sn, ua)
                except Exception as e:
                    logger.exception(
                        "xu ly bu that bai device_sn=%s user_id=%s punch_at=%s",
                        device_sn, user_id, pp.punch_at,
                    )
                    errors.append({"punch_at": pp.punch_at.isoformat(), "error": str(e)})
                    failed_ids.append(pp.id)
                    continue
                if outcome == "skipped_dup":
                    skipped += 1
                else:
                    created += 1

        # ignore=true (khong co emp) -> xoa het; co emp -> chi xoa nhung cai xu ly
        # thanh cong, giu lai loi de C&B map lai/thu lai sau.
        BiometricPendingPunch.objects.filter(
            device_sn=device_sn, device_user_id=user_id
        ).exclude(id__in=failed_ids).delete()

        return Response({
            "ignored": ignore,
            "employee_id": emp.id if emp else None,
            "pending_processed": len(pending),
            "created": created,
            "skipped_dup": skipped,
            "errors": errors,
        })
