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

    inside, distance_m, geo_err = check_geofence(lat, lng, company)
    if geo_err:
        return JsonResponse({"success": False, "message": geo_err}, status=500)
    if not inside:
        return JsonResponse({
            "success": False,
            "message": f"Ngoài phạm vi cho phép ({distance_m:.0f}m)",
            "distance_m": distance_m,
        }, status=400)

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
    return JsonResponse({
        "success": True,
        "message": f"{action_label} thành công ({distance_m:.0f}m)",
        "distance_m": distance_m,
        "timestamp": datetime.now().isoformat(),
    })
