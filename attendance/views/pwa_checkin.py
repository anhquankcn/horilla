import base64
import json
import logging
from datetime import datetime

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_POST

from attendance.models import AttendanceActivity, GPSCheckInLog
from attendance.views.clock_in_out import do_clock_in, do_clock_out
from geofencing.models import GeoFencing
from geofencing.utils import check_geofence
from horilla.decorators import login_required

logger = logging.getLogger(__name__)


@login_required
@require_GET
def pwa_checkin_page(request):
    employee = request.user.employee_get
    company = employee.get_company()
    work_info = employee.employee_work_info

    today_activities = AttendanceActivity.objects.filter(
        employee_id=employee,
        attendance_date=datetime.now().date(),
    ).order_by("clock_in")

    has_open_activity = today_activities.filter(clock_out__isnull=True).exists()

    geofence = None
    try:
        geofence = GeoFencing.objects.get(company_id=company)
    except GeoFencing.DoesNotExist:
        pass

    context = {
        "employee": employee,
        "company": company,
        "shift": work_info.shift_id if work_info else None,
        "today_activities": today_activities,
        "has_open_activity": has_open_activity,
        "geofence": geofence,
    }
    return render(request, "attendance/pwa/checkin.html", context)


@login_required
@require_POST
def pwa_checkin_api(request):
    try:
        employee = request.user.employee_get
    except Exception:
        return JsonResponse({"success": False, "message": "Không tìm thấy nhân viên"}, status=400)

    company = employee.get_company()

    rate_key = f"pwa_checkin_rate_{employee.pk}"
    attempts = cache.get(rate_key, 0)
    if attempts >= 10:
        return JsonResponse({"success": False, "message": "Quá nhiều lần thử. Vui lòng đợi."}, status=429)
    cache.set(rate_key, attempts + 1, 3600)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "message": "Invalid request body"}, status=400)

    lat = body.get("latitude")
    lng = body.get("longitude")
    accuracy = body.get("accuracy")
    action = body.get("action")
    selfie_b64 = body.get("selfie")
    offline_timestamp = body.get("offline_timestamp")

    if not lat or not lng:
        return JsonResponse({"success": False, "message": "Thiếu dữ liệu GPS"}, status=400)
    if action not in ("in", "out"):
        return JsonResponse({"success": False, "message": "action phải là 'in' hoặc 'out'"}, status=400)

    # Determine work type — "Văn phòng" employees are subject to geofence confirmation
    work_type_name = ""
    try:
        wi = employee.employee_work_info
        if wi and wi.work_type_id:
            work_type_name = wi.work_type_id.work_type
    except Exception:
        pass
    is_van_phong = work_type_name == "Văn phòng"

    inside, distance_m, geo_err = check_geofence(lat, lng, company)
    if geo_err:
        return JsonResponse({"success": False, "message": geo_err}, status=500)

    # Outside geofence: "Văn phòng" employees get soft flag (pending manager review),
    # all other work types pass through unrestricted.
    outside_geofence = not inside and distance_m > 0

    datetime_override = None
    is_offline = False
    if offline_timestamp:
        try:
            datetime_override = datetime.fromisoformat(offline_timestamp)
            is_offline = True
        except (ValueError, TypeError):
            pass

    if action == "in":
        attendance, err = do_clock_in(employee, datetime_override=datetime_override)
    else:
        attendance, err = do_clock_out(employee, datetime_override=datetime_override)

    if err:
        return JsonResponse({"success": False, "message": err}, status=400)

    # Flag outside-geofence attendances for manager review
    if outside_geofence and is_van_phong and attendance is not None:
        attendance.attendance_outside_geofence = True
        attendance.attendance_validated = False
        attendance.save(update_fields=["attendance_outside_geofence", "attendance_validated"])

    last_activity = AttendanceActivity.objects.filter(
        employee_id=employee,
    ).order_by("-id").first()

    log = GPSCheckInLog(
        employee=employee,
        attendance_activity=last_activity,
        latitude=float(lat),
        longitude=float(lng),
        accuracy=float(accuracy) if accuracy else None,
        distance_m=distance_m,
        source="pwa",
        is_offline_sync=is_offline,
        company=company,
        action=action,
    )

    if selfie_b64:
        try:
            img_data = base64.b64decode(selfie_b64)
            if len(img_data) <= 2 * 1024 * 1024:
                fname = f"{employee.pk}/{datetime.now():%Y%m%d_%H%M%S}.jpg"
                log.selfie.save(fname, ContentFile(img_data), save=False)
        except Exception:
            pass

    log.save()

    action_label = "Check-in" if action == "in" else "Check-out"
    if outside_geofence and is_van_phong:
        msg = f"{action_label} thành công — ngoài phạm vi ({distance_m:.0f}m), chờ quản lý xác nhận"
    else:
        msg = f"{action_label} thành công ({distance_m:.0f}m)"
    return JsonResponse({
        "success": True,
        "message": msg,
        "outside_geofence": outside_geofence and is_van_phong,
        "distance_m": distance_m,
        "timestamp": datetime.now().isoformat(),
    })
