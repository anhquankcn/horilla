import logging
from datetime import date, datetime, timedelta, timezone

from django import template
from django.conf import settings
from django.utils import timezone as django_tz
from django.core.mail import EmailMessage
from django.db import models
from django.db.models import Case, CharField, F, Value, When
from django.http import QueryDict
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from attendance.models import Attendance, AttendanceActivity, EmployeeShiftDay
from attendance.views.clock_in_out import *
from attendance.views.clock_in_out import clock_out
from attendance.views.dashboard import (
    find_expected_attendances,
    find_late_come,
    find_on_time,
)
from attendance.views.views import *
from base.backends import ConfiguredEmailBackend
from base.methods import generate_pdf, is_reportingmanager
from base.models import EmployeeShiftSchedule, HorillaMailTemplate
from employee.filters import EmployeeFilter

from ...api_decorators.base.decorators import (
    manager_permission_required,
    permission_required,
)
from ...api_methods.base.methods import groupby_queryset, permission_based_queryset
from ...api_serializers.attendance.serializers import (
    AttendanceActivitySerializer,
    AttendanceLateComeEarlyOutSerializer,
    AttendanceOverTimeSerializer,
    AttendanceRequestSerializer,
    AttendanceSerializer,
    MailTemplateSerializer,
    UserAttendanceDetailedSerializer,
    UserAttendanceListSerializer,
)

logger = logging.getLogger(__name__)


def query_dict(data):
    query_dict = QueryDict("", mutable=True)
    for key, value in data.items():
        if isinstance(value, list):
            for item in value:
                query_dict.appendlist(key, item)
        else:
            query_dict.update({key: value})
    return query_dict


def _is_clocked_in(employee):
    """Clocked-in = có activity MỞ (chưa clock_out) thuộc NGÀY HÔM NAY (giờ VN).

    Phải khớp ĐÚNG với CheckingStatus.status (= any activity hôm nay còn mở) để
    nút Chấm công của PWA quyết định in/out trùng với cổng chặn của server.

    Activity mở từ ngày trước = quên clock-out (NCO, No Clock Out): KHÔNG chặn
    clock-in hôm nay. Cách cũ dùng cửa sổ 18h khiến ca mở tối hôm trước (vd 15h)
    vẫn chặn sáng hôm sau (<18h) trong khi client coi là chưa chấm → PWA gọi
    clock-in lặp lại, server trả 400 'Already clocked-in', lượt chấm không được
    ghi nhận.
    """
    return AttendanceActivity.objects.filter(
        employee_id=employee,
        attendance_date=django_tz.localdate(),
        clock_out__isnull=True,
    ).exists()


def _parse_clock_device(request):
    """Resolve (kind, label, user_agent) of the clocking device. The PWA sends
    client_ua + device_kind in the body because the BFF proxy can mask the real
    HTTP_USER_AGENT. kind in {mobile, tablet, desktop, unknown}."""
    ua = (request.data.get("client_ua") or request.META.get("HTTP_USER_AGENT") or "")[:1024]
    kind = (request.data.get("device_kind") or "").strip().lower()
    u = ua.lower()
    if kind not in ("mobile", "tablet", "desktop"):
        if "ipad" in u or "tablet" in u:
            kind = "tablet"
        elif "mobi" in u or "android" in u or "iphone" in u:
            kind = "mobile"
        elif "windows" in u or "macintosh" in u or "x11" in u or "linux" in u:
            kind = "desktop"
        else:
            kind = "unknown"

    def _pick(pairs):
        for key, name in pairs:
            if key in u:
                return name
        return ""

    browser = _pick([("edg", "Edge"), ("samsungbrowser", "Samsung"), ("crios", "Chrome"),
                     ("chrome", "Chrome"), ("fxios", "Firefox"), ("firefox", "Firefox"),
                     ("safari", "Safari")]) or "Browser"
    os_name = _pick([("android", "Android"), ("iphone", "iOS"), ("ipad", "iPadOS"),
                     ("windows", "Windows"), ("mac os", "macOS"), ("macintosh", "macOS"),
                     ("linux", "Linux")])
    label = " · ".join([p for p in [browser, os_name, kind] if p])[:120]
    return kind, label, ua


def _clock_device_guard(request):
    """Block a clock punch on laptop/desktop and when no camera photo is attached.
    Returns (error_response_or_None, kind, label, user_agent)."""
    kind, label, ua = _parse_clock_device(request)
    if kind == "desktop":
        return (
            Response(
                {"error": "Chấm công không được thực hiện trên máy tính/laptop. Vui lòng dùng điện thoại."},
                status=403,
            ),
            kind, label, ua,
        )
    photo = request.data.get("photo")
    if not (isinstance(photo, str) and photo.startswith("data:image")):
        return (
            Response(
                {"error": "Bắt buộc bật camera và chụp ảnh để chấm công."},
                status=400,
            ),
            kind, label, ua,
        )
    return None, kind, label, ua


class ClockInAPIView(APIView):
    """
    Allows authenticated employees to clock in, determining the correct shift and attendance date, including handling night shifts.

    Methods:
        post(request): Processes and records the clock-in time.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        block, _dk, _dl, _ua = _clock_device_guard(request)
        if block is not None:
            return block
        if not _is_clocked_in(request.user.employee_get):
            employee, work_info = employee_exists(request)
            if not employee:
                return Response(
                    {"error": "Employee record not found"}, status=400
                )
            datetime_now = django_tz.localtime(django_tz.now())
            if request.__dict__.get("datetime"):
                datetime_now = request.datetime

            shift = getattr(work_info, "shift_id", None) if work_info else None
            date_today = datetime_now.date()
            if request.__dict__.get("date"):
                date_today = request.date
            attendance_date = date_today
            day = date_today.strftime("%A").lower()
            day = EmployeeShiftDay.objects.get(day=day)
            now = datetime_now.strftime("%H:%M")
            if request.__dict__.get("time"):
                now = request.time.strftime("%H:%M")

            minimum_hour, start_time_sec, end_time_sec = "00:00", 0, 0
            if shift:
                now_sec = strtime_seconds(now)
                mid_day_sec = strtime_seconds("12:00")
                minimum_hour, start_time_sec, end_time_sec = shift_schedule_today(
                    day=day, shift=shift
                )
                if start_time_sec > end_time_sec:
                    if mid_day_sec > now_sec:
                        date_yesterday = date_today - timedelta(days=1)
                        day_yesterday = date_yesterday.strftime("%A").lower()
                        day_yesterday = EmployeeShiftDay.objects.get(day=day_yesterday)
                        minimum_hour, start_time_sec, end_time_sec = (
                            shift_schedule_today(day=day_yesterday, shift=shift)
                        )
                        attendance_date = date_yesterday
                        day = day_yesterday

            attendance = clock_in_attendance_and_activity(
                employee=employee,
                date_today=date_today,
                attendance_date=attendance_date,
                day=day,
                now=now,
                shift=shift,
                minimum_hour=minimum_hour,
                start_time=start_time_sec,
                end_time=end_time_sec,
                in_datetime=datetime_now,
            )

            self._save_clock_in_extras(request, employee, datetime_now)
            geo_valid = self._check_geofence(request, employee, attendance)

            return Response(
                {"message": "Clocked-In", "geo_valid": geo_valid},
                status=200,
            )
        return Response({"message": "Already clocked-in"}, status=400)

    @staticmethod
    def _save_clock_in_extras(request, employee, in_datetime):
        """Save GPS + selfie photo to the just-created AttendanceActivity."""
        activity = (
            AttendanceActivity.objects.filter(employee_id=employee, in_datetime=in_datetime)
            .order_by("-id")
            .first()
        )
        if not activity:
            return
        updates = []
        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        if lat is not None:
            activity.clock_in_latitude = lat
            updates.append("clock_in_latitude")
        if lng is not None:
            activity.clock_in_longitude = lng
            updates.append("clock_in_longitude")
        if lat is not None and lng is not None:
            from attendance.geocode import reverse_geocode
            activity.clock_in_address = reverse_geocode(lat, lng)
            updates.append("clock_in_address")
        photo_b64 = request.data.get("photo")
        if photo_b64 and isinstance(photo_b64, str) and photo_b64.startswith("data:image"):
            import base64
            from django.core.files.base import ContentFile

            fmt, data = photo_b64.split(";base64,", 1)
            ext = fmt.split("/")[-1]
            filename = f"in_{employee.badge_id}_{in_datetime.strftime('%Y%m%d_%H%M%S')}.{ext}"
            activity.clock_in_photo.save(filename, ContentFile(base64.b64decode(data)), save=False)
            updates.append("clock_in_photo")
        if request.data.get("no_camera"):
            activity.no_camera = True
            updates.append("no_camera")
        _kind, _label, _ua = _parse_clock_device(request)
        if _label:
            activity.clock_in_device = _label
            updates.append("clock_in_device")
        if _ua:
            activity.clock_in_user_agent = _ua
            updates.append("clock_in_user_agent")
        wl = request.data.get("work_location")
        if wl in ("in_office", "out_of_office"):
            activity.work_location = wl
            updates.append("work_location")
        oof_type = request.data.get("out_of_office_type")
        if oof_type:
            activity.out_of_office_type = oof_type
            updates.append("out_of_office_type")
        oof_note = request.data.get("out_of_office_note")
        if oof_note:
            activity.out_of_office_note = oof_note
            updates.append("out_of_office_note")
        if updates:
            activity.save(update_fields=updates)

    @staticmethod
    def _check_geofence(request, employee, attendance):
        """Check GPS against geofence of selected office (or employee's company). Returns True/False/None."""
        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        if lat is None or lng is None:
            return None
        try:
            from geofencing.utils import check_geofence
            from base.models import Company, HRMConfig

            office_id = request.data.get("office_id")
            if office_id:
                try:
                    company = Company.objects.get(id=office_id)
                except Company.DoesNotExist:
                    company = employee.get_company()
            else:
                company = employee.get_company()

            inside, distance_m, _ = check_geofence(lat, lng, company)
            geo_approval = HRMConfig.get_value("geo_approval_required", True)
            if inside:
                attendance.attendance_validated = True
                attendance.save(update_fields=["attendance_validated"])
            elif not geo_approval:
                # setting tắt — bỏ qua duyệt, coi như hợp lệ
                return True
            return inside
        except Exception:
            return None


class ClockOutAPIView(APIView):
    """
    Allows authenticated employees to clock out, updating the latest attendance record and handling early outs.

    Methods:
        post(request): Records the clock-out time.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        block, _dk, _dl, _ua = _clock_device_guard(request)
        if block is not None:
            return block
        if _is_clocked_in(request.user.employee_get):
            employee = request.user.employee_get
            local_now = django_tz.localtime(django_tz.now())

            # 23:59 is reserved for auto-close (NCO). Real clock-out → 23:58
            if local_now.hour == 23 and local_now.minute == 59:
                local_now = local_now.replace(minute=58, second=0, microsecond=0)

            try:
                attendance, error = do_clock_out(employee, datetime_override=local_now)
                if error:
                    return Response({"error": error}, status=400)

                self._save_clock_out_extras(request, employee)
                geo_valid = self._check_geofence(request)

                return Response(
                    {"message": "Clocked-Out", "geo_valid": geo_valid},
                    status=200,
                )

            except Exception as error:
                logger.error("Got an error in clock_out: %s", error)
                return Response({"error": str(error)}, status=500)
        return Response({"message": "Already clocked-out"}, status=400)

    @staticmethod
    def _save_clock_out_extras(request, employee):
        """Save GPS, selfie photo, and supplement fields to the just-closed AttendanceActivity."""
        activity = (
            AttendanceActivity.objects.filter(employee_id=employee, clock_out__isnull=False)
            .order_by("-id")
            .first()
        )
        if not activity:
            return
        updates = []
        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        if lat is not None:
            activity.clock_out_latitude = lat
            updates.append("clock_out_latitude")
        if lng is not None:
            activity.clock_out_longitude = lng
            updates.append("clock_out_longitude")
        if lat is not None and lng is not None:
            from attendance.geocode import reverse_geocode
            activity.clock_out_address = reverse_geocode(lat, lng)
            updates.append("clock_out_address")
        photo_b64 = request.data.get("photo")
        if photo_b64 and isinstance(photo_b64, str) and photo_b64.startswith("data:image"):
            import base64
            from django.core.files.base import ContentFile

            fmt, data = photo_b64.split(";base64,", 1)
            ext = fmt.split("/")[-1]
            filename = f"out_{employee.badge_id}_{activity.clock_out_date}_{activity.clock_out.strftime('%H%M%S')}.{ext}"
            activity.clock_out_photo.save(filename, ContentFile(base64.b64decode(data)), save=False)
            updates.append("clock_out_photo")
        if request.data.get("no_camera"):
            activity.no_camera = True
            updates.append("no_camera")
        _kind, _label, _ua = _parse_clock_device(request)
        if _label:
            activity.clock_out_device = _label
            updates.append("clock_out_device")
        if _ua:
            activity.clock_out_user_agent = _ua
            updates.append("clock_out_user_agent")
        work_location = request.data.get("work_location")
        if work_location in ("in_office", "out_of_office"):
            activity.work_location = work_location
            updates.append("work_location")
        oof_type = request.data.get("out_of_office_type")
        if oof_type:
            activity.out_of_office_type = oof_type
            updates.append("out_of_office_type")
        oof_note = request.data.get("out_of_office_note")
        if oof_note:
            activity.out_of_office_note = oof_note
            updates.append("out_of_office_note")
        if updates:
            activity.save(update_fields=updates)

    @staticmethod
    def _check_geofence(request):
        """Check GPS against company geofence on clock-out.
        If outside, force attendance_validated=False (unless geo_approval_required=False)."""
        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        if lat is None or lng is None:
            return None
        try:
            from geofencing.utils import check_geofence
            from base.models import HRMConfig

            employee = request.user.employee_get
            company = employee.get_company()
            inside, distance_m, _ = check_geofence(lat, lng, company)
            geo_approval = HRMConfig.get_value("geo_approval_required", True)
            if not inside and geo_approval:
                attendance = (
                    Attendance.objects.filter(employee_id=employee)
                    .order_by("-attendance_date", "-id")
                    .first()
                )
                if attendance:
                    attendance.attendance_validated = False
                    attendance.save(update_fields=["attendance_validated"])
            if not inside:
                ClockOutAPIView._notify_manager_outside_geofence(employee, distance_m, request.user)
            if not inside and not geo_approval:
                return True
            return inside
        except Exception:
            return None

    @staticmethod
    def _notify_manager_outside_geofence(employee, distance_m, sender_user):
        """Notify reporting manager when employee clocks out outside geofence."""
        try:
            from notifications.signals import notify
            work_info = getattr(employee, "employee_work_info", None)
            if not work_info or not work_info.reporting_manager_id:
                return
            manager_user = work_info.reporting_manager_id.employee_user_id
            today = date.today().strftime("%d/%m/%Y")
            verb = (
                f"{employee.employee_first_name} {employee.employee_last_name} "
                f"clock out ngoài khu vực văn phòng ({distance_m:.0f}m) lúc {today}"
            )
            notify.send(
                sender_user,
                recipient=manager_user,
                verb=verb,
                icon="location-outline",
            )
        except Exception as e:
            logger.warning("Failed to notify manager for geofence: %s", e)


class OfficesAPIView(APIView):
    """Return all company offices that have GPS coordinates configured via GeoFencing."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from base.models import Company
        from geofencing.models import GeoFencing

        fences = GeoFencing.objects.select_related("company_id").all()
        result = []
        for fence in fences:
            company = fence.company_id
            if company is None:
                continue
            # Prefer coordinates from company info; fall back to GeoFencing record
            lat = float(company.latitude) if company.latitude else fence.latitude
            lng = float(company.longitude) if company.longitude else fence.longitude
            result.append({
                "id": company.id,
                "name": company.company,
                "address": company.address or "",
                "latitude": lat,
                "longitude": lng,
                "radius": fence.radius_in_meters,
                "active": fence.start,
            })

        # Also include companies with lat/lng set but no GeoFencing record
        fenced_ids = {f.company_id_id for f in fences if f.company_id_id}
        extra = Company.objects.exclude(id__in=fenced_ids).filter(
            latitude__isnull=False, longitude__isnull=False
        )
        for company in extra:
            result.append({
                "id": company.id,
                "name": company.company,
                "address": company.address or "",
                "latitude": company.latitude,
                "longitude": company.longitude,
                "radius": None,
                "active": False,
            })

        return Response(result, status=200)


class AutoClockoutScheduleView(APIView):
    """Returns the employee's auto clock-out time for today + geofence config for PWA timer."""

    permission_classes = [IsAuthenticated]

    WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    def get(self, request):
        try:
            employee = request.user.employee_get
        except Exception:
            return Response({"is_clocked_in": False, "auto_clock_out_enabled": False, "clock_out_at": None, "geofence": None})

        is_clocked_in = _is_clocked_in(employee)
        auto_enabled = getattr(employee, "pwa_auto_clock_out", True)

        result = {
            "is_clocked_in": is_clocked_in,
            "auto_clock_out_enabled": auto_enabled,
            "clock_out_at": None,
            "geofence": None,
        }

        if auto_enabled and is_clocked_in:
            today_name = self.WEEKDAY_NAMES[date.today().weekday()]
            work_info = getattr(employee, "employee_work_info", None)
            if work_info and work_info.shift_id:
                schedule = EmployeeShiftSchedule.objects.filter(
                    shift_id=work_info.shift_id,
                    day__day=today_name,
                    is_auto_punch_out_enabled=True,
                ).first()
                if schedule and schedule.auto_punch_out_time:
                    result["clock_out_at"] = schedule.auto_punch_out_time.strftime("%H:%M")

        try:
            from geofencing.models import GeoFencing
            company = employee.get_company()
            geofence = GeoFencing.objects.get(company_id=company)
            if geofence.start:
                clat = getattr(geofence.company_id, "latitude", None)
                clng = getattr(geofence.company_id, "longitude", None)
                result["geofence"] = {
                    "lat": float(clat or geofence.latitude),
                    "lng": float(clng or geofence.longitude),
                    "radius": geofence.radius_in_meters,
                }
        except Exception:
            pass

        return Response(result)


class AttendanceView(APIView):
    """
    Handles CRUD operations for attendance records.

    Methods:
        get_queryset(request, type): Returns filtered attendance records.
        get(request, pk=None, type=None): Retrieves a specific record or a list of records.
        post(request): Creates a new attendance record.
        put(request, pk): Updates an existing attendance record.
        delete(request, pk): Deletes an attendance record and adjusts related overtime if needed.
    """

    permission_classes = [IsAuthenticated]
    filterset_class = AttendanceFilters

    def get_queryset(self, request, type):
        if type == "ot":

            condition = AttendanceValidationCondition.objects.first()
            minot = strtime_seconds("00:30")
            if condition is not None:
                minot = strtime_seconds(condition.minimum_overtime_to_approve)
                queryset = Attendance.objects.filter(
                    overtime_second__gte=minot,
                    attendance_validated=True,
                )

        elif type == "validated":
            queryset = Attendance.objects.filter(attendance_validated=True)
        elif type == "non-validated":
            queryset = Attendance.objects.filter(attendance_validated=False)
        else:
            queryset = Attendance.objects.all()
        user = request.user
        # checking user level permissions
        perm = "attendance.view_attendance"
        queryset = permission_based_queryset(user, perm, queryset, user_obj=True)
        return queryset

    def get(self, request, pk=None, type=None):
        # individual object workflow
        if pk:
            attendance = get_object_or_404(Attendance, pk=pk)
            serializer = AttendanceSerializer(instance=attendance)
            return Response(serializer.data, status=200)
        # permission based querysete
        attendances = self.get_queryset(request, type)
        # filtering queryset
        attendances_filter_queryset = self.filterset_class(
            request.GET, queryset=attendances
        ).qs
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            url = request.build_absolute_uri()
            return groupby_queryset(
                request, url, field_name, attendances_filter_queryset
            )
        # pagination workflow
        paginater = PageNumberPagination()
        page = paginater.paginate_queryset(attendances_filter_queryset, request)
        serializer = AttendanceSerializer(page, many=True)
        return paginater.get_paginated_response(serializer.data)

    @manager_permission_required("attendance.add_attendance")
    def post(self, request):
        serializer = AttendanceSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        employee_id = request.data.get("employee_id")
        attendance_date = request.data.get("attendance_date", date.today())
        if Attendance.objects.filter(
            employee_id=employee_id, attendance_date=attendance_date
        ).exists():
            return Response(
                {
                    "error": [
                        "Attendance for this employee on the current date already exists."
                    ]
                },
                status=400,
            )
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("attendance.change_attendance"))
    def put(self, request, pk):
        try:
            attendance = Attendance.objects.get(id=pk)
        except Attendance.DoesNotExist:
            return Response({"detail": "Attendance record not found."}, status=404)

        serializer = AttendanceSerializer(instance=attendance, data=request.data)

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)

        # Customize error message for unique constraint
        serializer_errors = serializer.errors
        if "non_field_errors" in serializer.errors:
            unique_error_msg = (
                "The fields employee_id, attendance_date must make a unique set."
            )
            if unique_error_msg in serializer.errors["non_field_errors"]:
                serializer_errors = {
                    "non_field_errors": [
                        "The employee already has attendance on this date."
                    ]
                }
        return Response(serializer_errors, status=400)

    @method_decorator(permission_required("attendance.delete_attendance"))
    def delete(self, request, pk):
        attendance = Attendance.objects.get(id=pk)
        month = attendance.attendance_date
        month = month.strftime("%B").lower()
        overtime = attendance.employee_id.employee_overtime.filter(month=month).last()
        if overtime is not None:
            if attendance.attendance_overtime_approve:
                # Subtract overtime of this attendance
                total_overtime = strtime_seconds(overtime.overtime)
                attendance_overtime_seconds = strtime_seconds(
                    attendance.attendance_overtime
                )
                if total_overtime > attendance_overtime_seconds:
                    total_overtime = total_overtime - attendance_overtime_seconds
                else:
                    total_overtime = attendance_overtime_seconds - total_overtime
                overtime.overtime = format_time(total_overtime)
                overtime.save()
            try:
                attendance.delete()
                return Response({"status", "deleted"}, status=200)
            except Exception as error:
                return Response({"error:", f"{error}"}, status=400)
        else:
            try:
                attendance.delete()
                return Response({"status", "deleted"}, status=200)
            except Exception as error:
                return Response({"error:", f"{error}"}, status=400)


class ValidateAttendanceView(APIView):
    """
    Validates an attendance record and sends a notification to the employee.

    Method:
        put(request, pk): Marks the attendance as validated and notifies the employee.
    """

    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        attendance = Attendance.objects.filter(id=pk).update(attendance_validated=True)
        attendance = Attendance.objects.filter(id=pk).first()
        try:
            notify.send(
                request.user.employee_get,
                recipient=attendance.employee_id.employee_user_id,
                verb=f"Your attendance for the date {attendance.attendance_date} is validated",
                verb_ar=f"تم تحقيق حضورك في تاريخ {attendance.attendance_date}",
                verb_de=f"Deine Anwesenheit für das Datum {attendance.attendance_date} ist bestätigt.",
                verb_es=f"Se valida tu asistencia para la fecha {attendance.attendance_date}.",
                verb_fr=f"Votre présence pour la date {attendance.attendance_date} est validée.",
                redirect="/attendance/view-my-attendance",
                icon="checkmark",
                api_redirect=f"/api/attendance/attendance?employee_id{attendance.employee_id}",
            )
        except:
            pass
        return Response(status=200)


class OvertimeApproveView(APIView):
    """
    Approves overtime for an attendance record and sends a notification to the employee.

    Method:
        put(request, pk): Marks the overtime as approved and notifies the employee.
    """

    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        try:
            attendance = Attendance.objects.filter(id=pk).update(
                attendance_overtime_approve=True
            )
        except Exception as E:
            return Response({"error": str(E)}, status=400)

        attendance = Attendance.objects.filter(id=pk).first()
        try:
            notify.send(
                request.user.employee_get,
                recipient=attendance.employee_id.employee_user_id,
                verb=f"Your {attendance.attendance_date}'s attendance overtime approved.",
                verb_ar=f"تمت الموافقة على إضافة ساعات العمل الإضافية لتاريخ {attendance.attendance_date}.",
                verb_de=f"Die Überstunden für den {attendance.attendance_date} wurden genehmigt.",
                verb_es=f"Se ha aprobado el tiempo extra de asistencia para el {attendance.attendance_date}.",
                verb_fr=f"Les heures supplémentaires pour la date {attendance.attendance_date} ont été approuvées.",
                redirect="/attendance/attendance-overtime-view",
                icon="checkmark",
                api_redirect="/api/attendance/attendance-hour-account/",
            )
        except:
            pass
        return Response(status=200)


def _notify_attendance_request(request, attendance):
    """Send push notification to reporting manager when an attendance request is submitted via API."""
    try:
        work_info = attendance.employee_id.employee_work_info
        if not work_info.reporting_manager_id:
            return
        manager_user = work_info.reporting_manager_id.employee_user_id
        employee = attendance.employee_id
        notify.send(
            request.user,
            recipient=manager_user,
            verb=f"{employee.employee_first_name} {employee.employee_last_name or ''} "
                 f"đã gửi yêu cầu xác nhận ngày công ngày {attendance.attendance_date}",
            redirect=f"/attendance/attendance-request-view/?id={attendance.id}",
            icon="checkmark-circle-outline",
        )
    except Exception:
        pass


class AttendanceRequestView(APIView):
    """
    Handles requests for creating, updating, and viewing attendance records.

    Methods:
        get(request, pk=None): Retrieves a specific attendance request by `pk` or a filtered list of requests.
        post(request): Creates a new attendance request.
        put(request, pk): Updates an existing attendance request.
    """

    serializer_class = AttendanceRequestSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if pk:
            attendance = Attendance.objects.get(id=pk)
            serializer = AttendanceRequestSerializer(instance=attendance)
            return Response(serializer.data, status=200)

        requests = Attendance.objects.filter(
            is_validate_request=True,
        )
        requests = filtersubordinates(
            request=request,
            perm="attendance.view_attendance",
            queryset=requests,
        )
        requests = requests | Attendance.objects.filter(
            employee_id__employee_user_id=request.user,
            is_validate_request=True,
        )
        request_filtered_queryset = AttendanceFilters(request.GET, requests).qs
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            # groupby workflow
            url = request.build_absolute_uri()
            return groupby_queryset(request, url, field_name, request_filtered_queryset)

        pagenation = PageNumberPagination()
        page = pagenation.paginate_queryset(request_filtered_queryset, request)
        serializer = self.serializer_class(page, many=True)
        return pagenation.get_paginated_response(serializer.data)

    def post(self, request):
        from attendance.forms import NewRequestForm

        form = NewRequestForm(data=request.data)
        if form.is_valid():
            work_type = form.cleaned_data.get("work_type_id")

            if not WorkType.objects.filter(pk=getattr(work_type, "pk", None)).exists():
                form.cleaned_data["work_type_id"] = None

            if form.new_instance is not None:
                form.new_instance.save()
                _notify_attendance_request(request, form.new_instance)

            return Response(form.data, status=200)
        employee_id = request.data.get("employee_id")
        attendance_date = request.data.get("attendance_date", date.today())
        if Attendance.objects.filter(
            employee_id=employee_id, attendance_date=attendance_date
        ).exists():
            return Response(
                {error: list(message) for error, message in form.errors.items()},
                status=400,
            )
        return Response(form.errors, status=404)

    def put(self, request, pk):
        from attendance.forms import AttendanceRequestForm

        attendance = Attendance.objects.get(id=pk)
        form = AttendanceRequestForm(data=request.data, instance=attendance)
        if form.is_valid():
            attendance = Attendance.objects.get(id=form.instance.pk)
            instance = form.save()
            instance.employee_id = attendance.employee_id
            instance.id = attendance.id
            work_type = form.cleaned_data.get("work_type_id")

            if not WorkType.objects.filter(pk=getattr(work_type, "pk", None)).exists():
                form.cleaned_data["work_type_id"] = None
            if attendance.request_type != "create_request":
                attendance.requested_data = json.dumps(instance.serialize())
                attendance.request_description = instance.request_description
                attendance.is_validate_request = True
                attendance.save()
            else:
                instance.is_validate_request_approved = False
                instance.is_validate_request = True
                instance.save()
            _notify_attendance_request(request, attendance)
            return Response(form.data, status=200)
        return Response(form.errors, status=404)


class AttendanceRequestApproveView(APIView):
    """
    Approves and updates an attendance request.

    Method:
        put(request, pk): Approves the attendance request, updates attendance records, and handles related activities.
    """

    permission_classes = [IsAuthenticated]

    @manager_permission_required("attendance.change_attendance")
    def put(self, request, pk):
        try:
            attendance = Attendance.objects.get(id=pk)
            prev_attendance_date = attendance.attendance_date
            prev_attendance_clock_in_date = attendance.attendance_clock_in_date
            prev_attendance_clock_in = attendance.attendance_clock_in
            attendance.attendance_validated = True
            attendance.is_validate_request_approved = True
            attendance.is_validate_request = False
            attendance.request_description = None
            attendance.save()
            if attendance.requested_data is not None:
                requested_data = json.loads(attendance.requested_data)
                requested_data["attendance_clock_out"] = (
                    None
                    if requested_data["attendance_clock_out"] == "None"
                    else requested_data["attendance_clock_out"]
                )
                requested_data["attendance_clock_out_date"] = (
                    None
                    if requested_data["attendance_clock_out_date"] == "None"
                    else requested_data["attendance_clock_out_date"]
                )
                Attendance.objects.filter(id=pk).update(**requested_data)
                # DUE TO AFFECT THE OVERTIME CALCULATION ON SAVE METHOD, SAVE THE INSTANCE ONCE MORE
                attendance = Attendance.objects.get(id=pk)
                attendance.save()
            if (
                attendance.attendance_clock_out is None
                or attendance.attendance_clock_out_date is None
            ):
                attendance.attendance_validated = True
                activity = AttendanceActivity.objects.filter(
                    employee_id=attendance.employee_id,
                    attendance_date=prev_attendance_date,
                    clock_in_date=prev_attendance_clock_in_date,
                    clock_in=prev_attendance_clock_in,
                )
                if activity:
                    activity.update(
                        employee_id=attendance.employee_id,
                        attendance_date=attendance.attendance_date,
                        clock_in_date=attendance.attendance_clock_in_date,
                        clock_in=attendance.attendance_clock_in,
                    )

                else:
                    AttendanceActivity.objects.create(
                        employee_id=attendance.employee_id,
                        attendance_date=attendance.attendance_date,
                        clock_in_date=attendance.attendance_clock_in_date,
                        clock_in=attendance.attendance_clock_in,
                    )
        except Exception as E:
            return Response({"error": str(E)}, status=400)
        return Response({"status": "approved"}, status=200)


class AttendanceRequestCancelView(APIView):
    """
    Cancels an attendance request.

    Method:
        put(request, pk): Cancels the attendance request, resetting its status and data, and deletes the request if it was a create request.
    """

    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        try:
            attendance = Attendance.objects.get(id=pk)
            if (
                attendance.employee_id.employee_user_id == request.user
                or is_reportingmanager(request)
                or request.user.has_perm("attendance.change_attendance")
            ):
                attendance.is_validate_request_approved = False
                attendance.is_validate_request = False
                attendance.request_description = None
                attendance.requested_data = None
                attendance.request_type = None

                attendance.save()
                if attendance.request_type == "create_request":
                    attendance.delete()
        except Exception as E:
            return Response({"error": str(E)}, status=400)
        return Response({"status": "success"}, status=200)


class AttendanceOverTimeView(APIView):
    """
    Manages CRUD operations for attendance overtime records.

    Methods:
        get(request, pk=None): Retrieves a specific overtime record by `pk` or a list of records with filtering and pagination.
        post(request): Creates a new overtime record.
        put(request, pk): Updates an existing overtime record.
        delete(request, pk): Deletes an overtime record.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if pk:
            attendance_ot = get_object_or_404(AttendanceOverTime, pk=pk)
            serializer = AttendanceOverTimeSerializer(attendance_ot)
            return Response(serializer.data, status=200)

        filterset_class = AttendanceOverTimeFilter(request.GET)
        queryset = filterset_class.qs
        self_account = queryset.filter(employee_id__employee_user_id=request.user)
        permission_based_queryset = filtersubordinates(
            request, queryset, "attendance.view_attendanceovertime"
        )
        queryset = permission_based_queryset | self_account
        field_name = request.GET.get("groupby_field", None)
        if field_name:
            # groupby workflow
            url = request.build_absolute_uri()
            return groupby_queryset(request, url, field_name, queryset)

        pagenation = PageNumberPagination()
        page = pagenation.paginate_queryset(queryset, request)
        serializer = AttendanceOverTimeSerializer(page, many=True)
        return pagenation.get_paginated_response(serializer.data)

    @manager_permission_required("attendance.add_attendanceovertime")
    def post(self, request):
        serializer = AttendanceOverTimeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @manager_permission_required("attendance.change_attendanceovertime")
    def put(self, request, pk):
        attendance_ot = get_object_or_404(AttendanceOverTime, pk=pk)
        serializer = AttendanceOverTimeSerializer(
            instance=attendance_ot, data=request.data
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=200)
        return Response(serializer.errors, status=400)

    @method_decorator(permission_required("attendance.delete_attendanceovertime"))
    def delete(self, request, pk):
        attendance = get_object_or_404(AttendanceOverTime, pk=pk)
        attendance.delete()

        return Response({"message": "Overtime deleted successfully"}, status=204)


class LateComeEarlyOutView(APIView):
    """
    Handles retrieval and deletion of late come and early out records.

    Methods:
        get(request, pk=None): Retrieves a list of late come and early out records with filtering.
        delete(request, pk=None): Deletes a specific late come or early out record by `pk`.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        data = LateComeEarlyOutFilter(request.GET)
        serializer = AttendanceLateComeEarlyOutSerializer(data.qs, many=True)
        return Response(serializer.data, status=200)

    def delete(self, request, pk=None):
        attendance = get_object_or_404(AttendanceLateComeEarlyOut, pk=pk)
        attendance.delete()
        return Response({"message": "Attendance deleted successfully"}, status=204)


class AttendanceActivityView(APIView):
    """
    Retrieves attendance activity records.

    Method:
        get(request, pk=None): Retrieves a list of all attendance activity records.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        data = AttendanceActivity.objects.all()
        serializer = AttendanceActivitySerializer(data, many=True)
        return Response(serializer.data, status=200)


class TodayAttendance(APIView):
    """
    Provides the ratio of marked attendances to expected attendances for the current day.

    Method:
        get(request): Calculates and returns the attendance ratio for today.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):

        today = datetime.today()
        week_day = today.strftime("%A").lower()

        on_time = find_on_time(request, today=today, week_day=week_day)
        late_come = find_late_come(start_date=today)
        late_come_obj = len(late_come)

        marked_attendances = late_come_obj + on_time

        expected_attendances = find_expected_attendances(week_day=week_day)
        marked_attendances_ratio = 0
        if expected_attendances != 0:
            marked_attendances_ratio = (
                f"{(marked_attendances / expected_attendances) * 100:.2f}"
            )

        return Response(
            {"marked_attendances_ratio": marked_attendances_ratio}, status=200
        )


class OfflineEmployeesCountView(APIView):
    """
    Retrieves the count of active employees who have not clocked in today.

    Method:
        get(request): Returns the number of active employees who are not yet clocked in.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        is_manager = (
            EmployeeWorkInformation.objects.filter(
                reporting_manager_id=request.user.employee_get
            )
            .only("id")
            .exists()
        )

        if request.user.has_perm("employee.view_enployee") or is_manager:
            count = (
                EmployeeFilter({"not_in_yet": date.today()})
                .qs.exclude(employee_work_info__isnull=True)
                .filter(is_active=True)
                .count()
            )
            return Response({"count": count}, status=200)
        return Response(
            {"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN
        )


class OfflineEmployeesListView(APIView):
    """
    Li sts active employees who have not clocked in today, including their leave status.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        employee = getattr(user, "employee_get", None)
        today = date.today()

        # Manager access: get employees reporting to current user
        managed_employee_ids = EmployeeWorkInformation.objects.filter(
            reporting_manager_id=employee
        ).values_list("employee_id", flat=True)

        # Superusers or users with view permission see all employees
        if user.has_perm("employee.view_employee"):
            base_queryset = Employee.objects.all()
        elif managed_employee_ids.exists():
            base_queryset = Employee.objects.filter(id__in=managed_employee_ids)
        else:
            return Response(
                {"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN
            )

        # Apply filtering for offline employees
        filtered_qs = (
            EmployeeFilter({"not_in_yet": today}, queryset=base_queryset)
            .qs.exclude(employee_work_info__isnull=True)
            .filter(is_active=True)
            .select_related("employee_work_info")  # optimize joins
        )

        # Get leave status for the filtered employees
        leave_status = self.get_leave_status(filtered_qs)

        pagenation = PageNumberPagination()
        page = pagenation.paginate_queryset(leave_status, request)
        return pagenation.get_paginated_response(page)

    def get_leave_status(self, queryset):

        today = date.today()
        queryset = queryset.distinct()
        # Annotate each employee with their leave status
        employees_with_leave_status = queryset.annotate(
            leave_status=Case(
                # Define different cases based on leave requests and attendance
                When(
                    leaverequest__start_date__lte=today,
                    leaverequest__end_date__gte=today,
                    leaverequest__status="approved",
                    then=Value("On Leave"),
                ),
                When(
                    leaverequest__start_date__lte=today,
                    leaverequest__end_date__gte=today,
                    leaverequest__status="requested",
                    then=Value("Waiting Approval"),
                ),
                When(
                    leaverequest__start_date__lte=today,
                    leaverequest__end_date__gte=today,
                    then=Value("Canceled / Rejected"),
                ),
                When(
                    employee_attendances__attendance_date=today, then=Value("Working")
                ),
                default=Value("Expected working"),  # Default status
                output_field=CharField(),
            ),
            job_position_id=F("employee_work_info__job_position_id"),
        ).values(
            "employee_first_name",
            "employee_last_name",
            "leave_status",
            "employee_profile",
            "id",
            "job_position_id",
        )

        for employee in employees_with_leave_status:

            if employee["employee_profile"]:
                employee["employee_profile"] = (
                    settings.MEDIA_URL + employee["employee_profile"]
                )
        return employees_with_leave_status


class CheckingStatus(APIView):
    """
    Checks and provides the current attendance status for the authenticated user.

    Method:
        get(request): Returns the attendance status, duration at work, and clock-in time if available.
    """

    permission_classes = [IsAuthenticated]

    @classmethod
    def _format_seconds(cls, seconds):
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        seconds = seconds % 60
        return f"{hours:02}:{minutes:02}:{seconds:02}"

    @staticmethod
    def _auto_close_yesterday(employee):
        """NCO policy: KHÔNG còn tự đóng activity/attendance ngày cũ lúc 23:59.

        Nếu nhân viên quên clock-out, hoạt động ngày đó để MỞ và coi là NCO
        (No Clock Out): hiển thị NCO trong CC Tháng, nhân viên phải nộp đơn khai
        báo ngày công để C&B duyệt. Clock-in ngày mới vẫn bình thường vì
        _is_clocked_in chỉ tính ca mở trong ~18h gần nhất. Giữ method (no-op) để
        không phá vỡ chỗ gọi hiện có.
        """
        return

    def get(self, request):
        try:
            self._auto_close_yesterday(request.user.employee_get)
        except Exception:
            pass

        # Giờ công = span lượt cuối − lượt đầu trong ngày (= attendance_worked_hour ALD26),
        # KHÔNG tick live. Chưa chấm lượt nào hôm nay → 00:00:00.
        duration = "00:00:00"
        try:
            att_today = Attendance.objects.filter(
                employee_id=request.user.employee_get, attendance_date=django_tz.localdate()
            ).first()
            if att_today and att_today.attendance_worked_hour:
                wh = att_today.attendance_worked_hour
                duration = wh if wh.count(":") >= 2 else f"{wh}:00"
        except Exception:
            duration = "00:00:00"

        # ALD26: First = lượt chấm ĐẦU trong ngày, Last = lượt chấm CUỐI (kể cả lượt
        # mở/clock-in chưa đóng). Last hiện khi có ≥2 lượt; status = còn activity mở.
        try:
            acts = list(AttendanceActivity.objects.filter(
                employee_id=request.user.employee_get, attendance_date=django_tz.localdate()
            ))
        except Exception:
            acts = []

        punch_times = []
        for a in acts:
            if a.clock_in:
                punch_times.append(a.clock_in)
            if a.clock_out:
                punch_times.append(a.clock_out)
        punch_times.sort()

        clock_in_time = punch_times[0].strftime("%H:%M") if punch_times else None
        clock_out_time = punch_times[-1].strftime("%H:%M") if len(punch_times) >= 2 else None

        status = any(a.clock_out is None for a in acts)
        clock_in_iso = None
        first_act = min(acts, key=lambda x: (x.in_datetime or x.id), default=None) if acts else None
        if first_act and first_act.in_datetime:
            clock_in_iso = first_act.in_datetime.isoformat()

        return Response(
            {
                "status": status,
                "duration": duration,
                "clock_in": clock_in_time,
                "clock_in_iso": clock_in_iso,
                "clock_out": clock_out_time,
            },
            status=200,
        )


class MailTemplateView(APIView):
    """
    Retrieves a list of recruitment mail templates.

    Method:
        get(request): Returns all recruitment mail templates.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        instances = HorillaMailTemplate.objects.all()
        serializer = MailTemplateSerializer(instances, many=True)
        return Response(serializer.data, status=200)


class ConvertedMailTemplateConvert(APIView):
    """
    Renders a recruitment mail template with data from a specified employee.

    Method:
        put(request): Renders the mail template body with employee and user data and returns the result.
    """

    permission_classes = [IsAuthenticated]

    def put(self, request):
        template_id = request.data.get("template_id", None)
        employee_id = request.data.get("employee_id", None)
        employee = Employee.objects.filter(id=employee_id).first()
        bdy = HorillaMailTemplate.objects.filter(id=template_id).first()
        template_bdy = template.Template(bdy.body)
        context = template.Context(
            {"instance": employee, "self": request.user.employee_get}
        )
        render_bdy = template_bdy.render(context)
        return Response(render_bdy)


class OfflineEmployeeMailsend(APIView):
    """
    Sends an email with attachments and rendered templates to a specified employee.

    Method:
        post(request): Renders email templates with employee and user data, attaches files, and sends the email.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        employee_id = request.POST.get("employee_id")
        subject = request.POST.get("subject", "")
        bdy = request.POST.get("body", "")
        other_attachments = request.FILES.getlist("other_attachments")
        attachments = [
            (file.name, file.read(), file.content_type) for file in other_attachments
        ]
        email_backend = ConfiguredEmailBackend()
        host = email_backend.dynamic_username
        employee = Employee.objects.get(id=employee_id)
        template_attachment_ids = request.POST.getlist("template_attachments")
        bodys = list(
            HorillaMailTemplate.objects.filter(
                id__in=template_attachment_ids
            ).values_list("body", flat=True)
        )
        for html in bodys:
            # due to not having solid template we first need to pass the context
            template_bdy = template.Template(html)
            context = template.Context(
                {"instance": employee, "self": request.user.employee_get}
            )
            render_bdy = template_bdy.render(context)
            attachments.append(
                (
                    "Document",
                    generate_pdf(render_bdy, {}, path=False, title="Document").content,
                    "application/pdf",
                )
            )

        template_bdy = template.Template(bdy)
        context = template.Context(
            {"instance": employee, "self": request.user.employee_get}
        )
        render_bdy = template_bdy.render(context)

        email = EmailMessage(
            subject,
            render_bdy,
            host,
            [employee.employee_work_info.email],
        )
        email.content_subtype = "html"

        email.attachments = attachments
        try:
            email.send()
            if employee.employee_work_info.email:
                return Response(f"Mail sent to {employee.get_full_name()}")
            else:
                return Response(f"Email not set for {employee.get_full_name()}")
        except Exception as e:
            return Response("Something went wrong")


class UserAttendanceView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserAttendanceDetailedSerializer

    def get(self, request):
        from django.db.models import Subquery, OuterRef

        employee_id = request.user.employee_get.id

        # Annotate with latest AttendanceActivity clock_in/clock_out per attendance date
        latest_act = AttendanceActivity.objects.filter(
            employee_id=OuterRef('employee_id'),
            attendance_date=OuterRef('attendance_date'),
        ).order_by('-id')

        attendance_queryset = Attendance.objects.filter(
            employee_id=employee_id
        ).annotate(
            latest_act_clock_in=Subquery(latest_act.values('clock_in')[:1]),
            latest_act_clock_out=Subquery(latest_act.values('clock_out')[:1]),
        ).order_by("-id")

        paginator = PageNumberPagination()
        paginator.page_size = 20
        page = paginator.paginate_queryset(attendance_queryset, request)

        serializer = self.serializer_class(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class AttendanceTypeAccessCheck(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        employee_id = user.employee_get.id

        if user.has_perm("attendance.view_attendance"):
            return Response(status=200)

        is_manager = (
            EmployeeWorkInformation.objects.filter(reporting_manager_id=employee_id)
            .only("id")
            .exists()
        )

        if is_manager:
            return Response(status=200)

        return Response(
            {"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN
        )


class UserAttendanceDetailedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        attendance = get_object_or_404(Attendance, pk=id)
        if attendance.employee_id == request.user.employee_get:
            serializer = UserAttendanceDetailedSerializer(attendance)
            return Response(serializer.data, status=200)
        return Response(
            {"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN
        )


class MyAttendanceActivitiesView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _nearest_company(lat, lng, companies):
        """Return (name, address, distance_m) for the company closest to lat/lng."""
        if lat is None or lng is None or not companies:
            return None, None, None
        from geopy.distance import geodesic

        best_name = best_addr = None
        best_dist = float("inf")
        point = (float(lat), float(lng))
        for c in companies:
            dist = geodesic(point, (c["latitude"], c["longitude"])).meters
            if dist < best_dist:
                best_dist = dist
                best_name = c["company"]
                best_addr = c["address"]
        return best_name, best_addr, round(best_dist)

    def get(self, request, id):
        from base.models import Company

        attendance = get_object_or_404(Attendance, pk=id)
        employee = request.user.employee_get
        if attendance.employee_id != employee:
            return Response(
                {"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN
            )
        activities = list(
            AttendanceActivity.objects.filter(
                employee_id=employee,
                attendance_date=attendance.attendance_date,
            ).order_by("id")
        )
        serializer = AttendanceActivitySerializer(activities, many=True)
        result = list(serializer.data)

        # Load companies that have coordinates configured
        companies = list(
            Company.objects.filter(
                latitude__isnull=False, longitude__isnull=False
            ).values("company", "address", "latitude", "longitude")
        )

        # Enrich each activity: compute nearest company + distance from activity GPS coords
        for i, act in enumerate(activities):
            name_in, addr_in, dist_in = self._nearest_company(
                act.clock_in_latitude, act.clock_in_longitude, companies
            )
            name_out, addr_out, dist_out = self._nearest_company(
                act.clock_out_latitude, act.clock_out_longitude, companies
            )
            result[i]["gps_in_distance_m"] = dist_in
            result[i]["gps_in_company_name"] = name_in
            result[i]["gps_in_company_address"] = addr_in
            result[i]["gps_out_distance_m"] = dist_out
            result[i]["gps_out_company_name"] = name_out
            result[i]["gps_out_company_address"] = addr_out

        return Response(result, status=200)


class MyScheduleAPIView(APIView):
    """Returns the authenticated employee's weekly shift schedule."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            employee = request.user.employee_get
        except Exception:
            return Response({"error": "No employee record"}, status=404)
        work_info = getattr(employee, "employee_work_info", None)
        if not work_info or not work_info.shift_id:
            return Response({"error": "No shift assigned"}, status=404)
        schedules = EmployeeShiftSchedule.objects.filter(
            shift_id=work_info.shift_id
        ).select_related("day", "shift_id")
        data = []
        for s in schedules:
            data.append(
                {
                    "day": s.day.day if s.day else None,
                    "shift": s.shift_id.employee_shift if s.shift_id else None,
                    "start_time": s.start_time.strftime("%H:%M") if s.start_time else None,
                    "end_time": s.end_time.strftime("%H:%M") if s.end_time else None,
                    "minimum_working_hour": s.minimum_working_hour,
                    "is_night_shift": s.is_night_shift,
                }
            )
        return Response(data, status=200)


def _hnh_working_days(n, ref_date=None):
    """Return the last `n` HNH working days (Mon-Sat) ending at ref_date."""
    if ref_date is None:
        ref_date = date.today()
    days = []
    d = ref_date
    while len(days) < n:
        if d.weekday() < 6:  # Mon(0)–Sat(5)
            days.append(d)
        d -= timedelta(days=1)
    days.reverse()
    return days


class AttendanceActivityOverviewView(APIView):
    """
    Manager view: attendance activities for all employees.
    Query params:
      mode = today | 3days | 7days | month | range
      month, year  (for mode=month)
      date_from, date_to  (for mode=range)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from employee.models import Employee, EmployeeWorkInformation

        mode = request.GET.get("mode", "today")
        today = date.today()

        if mode == "today":
            dates = [today]
        elif mode == "3days":
            dates = _hnh_working_days(3, today)
        elif mode == "7days":
            dates = _hnh_working_days(7, today)
        elif mode == "month":
            y = int(request.GET.get("year", today.year))
            m = int(request.GET.get("month", today.month))
            d = date(y, m, 1)
            end = date(y + (1 if m == 12 else 0), (m % 12) + 1, 1)
            dates = []
            while d < end:
                dates.append(d)
                d += timedelta(days=1)
        elif mode == "range":
            d_from = request.GET.get("date_from")
            d_to = request.GET.get("date_to")
            if not d_from or not d_to:
                return Response(
                    {"error": "date_from and date_to required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            d = date.fromisoformat(d_from)
            end = date.fromisoformat(d_to)
            dates = []
            while d <= end:
                dates.append(d)
                d += timedelta(days=1)
        else:
            dates = [today]

        total_employees = Employee.objects.filter(is_active=True).exclude(
            employee_work_info__isnull=True
        ).count()

        activities = (
            AttendanceActivity.objects.filter(
                attendance_date__in=dates,
                employee_id__is_active=True,
            )
            .select_related("employee_id")
            .order_by("-attendance_date", "-clock_in")
        )

        grid_mode = mode in ("today", "3days", "7days")

        grid = []
        if grid_mode:
            SLOTS_AM = []
            t = datetime(2000, 1, 1, 7, 30)
            end_am = datetime(2000, 1, 1, 9, 0)
            while t < end_am:
                SLOTS_AM.append(t.time())
                t += timedelta(minutes=15)

            SLOTS_PM = []
            t = datetime(2000, 1, 1, 16, 30)
            end_pm = datetime(2000, 1, 1, 18, 0)
            while t < end_pm:
                SLOTS_PM.append(t.time())
                t += timedelta(minutes=15)

            all_slots = SLOTS_AM + SLOTS_PM

            for d in dates:
                day_acts = [a for a in activities if a.attendance_date == d]
                slots_data = []
                for slot_start in all_slots:
                    slot_end_dt = datetime.combine(d, slot_start) + timedelta(minutes=15)
                    slot_end = slot_end_dt.time()
                    count = 0
                    for a in day_acts:
                        if a.clock_in and slot_start <= a.clock_in < slot_end:
                            count += 1
                    slots_data.append({
                        "time": slot_start.strftime("%H:%M"),
                        "count": count,
                    })
                grid.append({
                    "date": d.isoformat(),
                    "weekday": d.strftime("%a"),
                    "slots": slots_data,
                })

        list_data = []
        for a in activities:
            emp = a.employee_id
            list_data.append({
                "id": a.id,
                "employee_id": emp.id,
                "employee_name": f"{emp.employee_first_name} {emp.employee_last_name or ''}".strip(),
                "badge_id": emp.badge_id,
                "date": a.attendance_date.isoformat(),
                "clock_in": a.clock_in.strftime("%H:%M") if a.clock_in else None,
                "clock_out": a.clock_out.strftime("%H:%M") if a.clock_out else None,
                "clock_in_date": a.clock_in_date.isoformat() if a.clock_in_date else None,
                "clock_out_date": a.clock_out_date.isoformat() if a.clock_out_date else None,
            })

        return Response({
            "mode": mode,
            "dates": [d.isoformat() for d in dates],
            "total_employees": total_employees,
            "grid": grid,
            "activities": list_data,
        })


class MyAttendanceRequestsView(APIView):
    """List current user's attendance adjustment requests (is_validate_request)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = request.user.employee_get
        status_filter = request.GET.get("status", "")

        qs = Attendance.objects.filter(employee_id=employee).order_by("-id")

        if status_filter == "pending":
            qs = qs.filter(is_validate_request=True, is_validate_request_approved=False)
        elif status_filter == "approved":
            qs = qs.filter(is_validate_request_approved=True)
        elif status_filter == "all_requests":
            qs = qs.filter(
                models.Q(is_validate_request=True)
                | models.Q(is_validate_request_approved=True)
            )
        else:
            qs = qs.filter(
                models.Q(is_validate_request=True)
                | models.Q(is_validate_request_approved=True)
            )

        data = []
        for att in qs[:50]:
            att_status = "approved" if att.is_validate_request_approved else (
                "pending" if att.is_validate_request else "normal"
            )
            data.append({
                "id": att.id,
                "attendance_date": att.attendance_date.isoformat() if att.attendance_date else None,
                "clock_in": att.attendance_clock_in.strftime("%H:%M") if att.attendance_clock_in else None,
                "clock_out": att.attendance_clock_out.strftime("%H:%M") if att.attendance_clock_out else None,
                "clock_in_date": att.attendance_clock_in_date.isoformat() if att.attendance_clock_in_date else None,
                "clock_out_date": att.attendance_clock_out_date.isoformat() if att.attendance_clock_out_date else None,
                "worked_hour": att.attendance_worked_hour or "00:00",
                "shift_name": att.shift_id.employee_shift if att.shift_id else None,
                "work_type_name": att.work_type_id.work_type if att.work_type_id else None,
                "description": att.request_description or "",
                "request_type": att.request_type or "",
                "status": att_status,
            })

        return Response(data)


class MyCalendarView(APIView):
    """Monthly calendar data: shift schedule + attendance + approved leaves + holidays."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        import calendar as cal_mod
        from leave.models import LeaveRequest
        from leave.models import Holiday, CompanyLeave

        employee = request.user.employee_get
        month_str = request.query_params.get("month")
        today = date.today()
        if month_str:
            try:
                parts = month_str.split("-")
                year, month = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                year, month = today.year, today.month
        else:
            year, month = today.year, today.month

        _, last_day = cal_mod.monthrange(year, month)
        start = date(year, month, 1)
        end = date(year, month, last_day)

        # Shift schedule
        work_info = getattr(employee, "employee_work_info", None)
        shift = work_info.shift_id if work_info else None
        shift_data = None
        schedule_map = {}
        if shift:
            shift_data = {"name": shift.employee_shift}
            for s in EmployeeShiftSchedule.objects.filter(
                shift_id=shift
            ).select_related("day"):
                day_name = s.day.day if s.day else None
                if day_name:
                    schedule_map[day_name] = {
                        "start_time": s.start_time.strftime("%H:%M") if s.start_time else None,
                        "end_time": s.end_time.strftime("%H:%M") if s.end_time else None,
                        "is_night_shift": s.is_night_shift,
                    }

        DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

        # Attendance records for the month
        att_map = {}
        for a in Attendance.objects.filter(
            employee_id=employee,
            attendance_date__range=[start, end],
        ).prefetch_related("late_come_early_out", "comments").order_by("attendance_date"):
            d = a.attendance_date.isoformat()
            lc = any(x.type == "late_come" for x in a.late_come_early_out.all())
            eo = any(x.type == "early_out" for x in a.late_come_early_out.all())
            att_map[d] = {
                "id": a.id,
                "clock_in": a.attendance_clock_in.strftime("%H:%M") if a.attendance_clock_in else None,
                "clock_out": a.attendance_clock_out.strftime("%H:%M") if a.attendance_clock_out else None,
                "worked_hours": a.attendance_worked_hour or None,
                "minimum_hour": a.minimum_hour or None,
                "overtime": a.attendance_overtime or None,
                "overtime_approved": a.attendance_overtime_approve,
                "validated": a.attendance_validated,
                "is_validate_request": a.is_validate_request,
                "late_come": lc,
                "early_out": eo,
                "comment_count": a.comments.count(),
            }

        # Approved leaves in the month
        leave_map = {}  # date → (leave_type_name, is_paid)
        for lr in LeaveRequest.objects.filter(
            employee_id=employee,
            status="approved",
            start_date__lte=end,
            end_date__gte=start,
        ).select_related("leave_type_id"):
            lt = lr.leave_type_id
            name = lt.name if lt else "Nghỉ phép"
            is_paid = (lt.payment == "paid") if lt else False
            d = lr.start_date
            while d <= (lr.end_date or lr.start_date):
                if start <= d <= end:
                    leave_map[d.isoformat()] = (name, is_paid)
                d += timedelta(days=1)

        # Holidays
        holiday_map = {}
        for h in Holiday.objects.filter(start_date__lte=end, end_date__gte=start):
            d = h.start_date
            while d <= (h.end_date or h.start_date):
                if start <= d <= end:
                    holiday_map[d.isoformat()] = h.name
                d += timedelta(days=1)

        # Company leaves (recurring weekly days off)
        company_leave_days = set()
        try:
            for cl in CompanyLeave.objects.all():
                if cl.based_on_week_day:
                    company_leave_days.add(cl.based_on_week_day)
        except Exception:
            pass

        # Build day-by-day data
        days = {}
        for day_num in range(1, last_day + 1):
            d = date(year, month, day_num)
            d_iso = d.isoformat()
            weekday_name = DAY_NAMES[d.weekday()]

            sched = schedule_map.get(weekday_name)
            att = att_map.get(d_iso)
            leave_entry = leave_map.get(d_iso)  # (name, is_paid) or None
            leave_name = leave_entry[0] if leave_entry else None
            leave_is_paid = leave_entry[1] if leave_entry else False
            holiday_name = holiday_map.get(d_iso)
            is_company_leave = str(d.weekday()) in company_leave_days

            if holiday_name:
                day_type = "holiday"
            elif leave_name:
                day_type = "leave"
            elif is_company_leave or not sched:
                day_type = "off"
            else:
                day_type = "workday"

            if d > today:
                day_status = "future"
            elif holiday_name:
                day_status = "holiday"
            elif leave_name:
                day_status = "leave"
            elif att:
                day_status = "present"
            elif day_type == "workday" and d <= today:
                day_status = "absent"
            else:
                day_status = "off"

            days[d_iso] = {
                "type": day_type,
                "status": day_status,
                "shift_start": sched["start_time"] if sched else None,
                "shift_end": sched["end_time"] if sched else None,
                "clock_in": att["clock_in"] if att else None,
                "clock_out": att["clock_out"] if att else None,
                "worked_hours": att["worked_hours"] if att else None,
                "minimum_hour": att["minimum_hour"] if att else None,
                "overtime": att["overtime"] if att else None,
                "overtime_approved": att["overtime_approved"] if att else False,
                "validated": att["validated"] if att else False,
                "is_validate_request": att["is_validate_request"] if att else False,
                "late_come": att["late_come"] if att else False,
                "early_out": att["early_out"] if att else False,
                "attendance_id": att["id"] if att else None,
                "comment_count": att["comment_count"] if att else 0,
                "leave_type": leave_name,
                "leave_is_paid": leave_is_paid,
                "holiday_name": holiday_name,
            }

        return Response({
            "year": year,
            "month": month,
            "shift": shift_data,
            "schedule": schedule_map,
            "days": days,
        })


class AttendanceCommentView(APIView):
    """GET list / POST create comments on an attendance record."""

    permission_classes = [IsAuthenticated]

    def _get_attendance(self, request, pk):
        attendance = get_object_or_404(Attendance, pk=pk)
        employee = request.user.employee_get
        is_owner = attendance.employee_id == employee
        is_hr = request.user.has_perm("attendance.change_attendance")
        return attendance, is_owner, is_hr

    def get(self, request, pk):
        from attendance.models import AttendanceComment
        attendance, is_owner, is_hr = self._get_attendance(request, pk)
        if not (is_owner or is_hr):
            return Response({"error": "Permission denied"}, status=403)
        comments = AttendanceComment.objects.filter(attendance=attendance).select_related("author")
        data = [
            {
                "id": c.id,
                "author_name": f"{c.author.employee_first_name} {c.author.employee_last_name or ''}".strip(),
                "is_hr": c.author.employee_user_id.has_perm("attendance.change_attendance") if c.author.employee_user_id else False,
                "content": c.content,
                "created_at": c.created_at.strftime("%Y-%m-%dT%H:%M:%S"),
            }
            for c in comments
        ]
        return Response(data)

    def post(self, request, pk):
        from attendance.models import AttendanceComment
        from notifications.signals import notify
        attendance, is_owner, is_hr = self._get_attendance(request, pk)
        if not (is_owner or is_hr):
            return Response({"error": "Permission denied"}, status=403)
        content = request.data.get("content", "").strip()
        if not content:
            return Response({"error": "Nội dung không được trống"}, status=400)
        employee = request.user.employee_get
        comment = AttendanceComment.objects.create(
            attendance=attendance, author=employee, content=content,
        )
        # Notify the other party
        if is_owner and not is_hr:
            # Employee commented → notify reporting manager / HR
            work_info = getattr(employee, "employee_work_info", None)
            if work_info and work_info.reporting_manager_id:
                manager_user = work_info.reporting_manager_id.employee_user_id
                notify.send(
                    request.user,
                    recipient=manager_user,
                    verb=f"{employee.employee_first_name} có ý kiến về ngày công {attendance.attendance_date}",
                    redirect=f"/attendance/attendance-request-view/?id={attendance.id}",
                    icon="chatbubble-outline",
                )
        else:
            # HR commented → notify the employee
            emp_user = attendance.employee_id.employee_user_id
            if emp_user:
                notify.send(
                    request.user,
                    recipient=emp_user,
                    verb=f"HR phản hồi ý kiến về ngày công {attendance.attendance_date} của bạn",
                    redirect="/attendance",
                    icon="chatbubble-outline",
                )
        return Response({
            "id": comment.id,
            "author_name": f"{employee.employee_first_name} {employee.employee_last_name or ''}".strip(),
            "is_hr": is_hr,
            "content": comment.content,
            "created_at": comment.created_at.strftime("%Y-%m-%dT%H:%M:%S"),
        }, status=201)


class PWAAttendanceRequestView(APIView):
    """PWA-friendly endpoint to create/update attendance adjustment requests."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        import json as _json

        employee = request.user.employee_get
        data = request.data

        attendance_date_str = data.get("attendance_date")
        clock_in_str = data.get("attendance_clock_in")
        clock_out_str = data.get("attendance_clock_out")
        description = data.get("description", "")

        if not attendance_date_str or not clock_in_str:
            return Response(
                {"error": "Vui lòng nhập ngày và giờ vào"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            att_date = date.fromisoformat(attendance_date_str)
        except ValueError:
            return Response(
                {"error": "Ngày không hợp lệ"}, status=status.HTTP_400_BAD_REQUEST
            )

        clock_in_date_str = data.get("attendance_clock_in_date", attendance_date_str)
        clock_out_date_str = data.get("attendance_clock_out_date", attendance_date_str)

        existing = Attendance.objects.filter(
            employee_id=employee, attendance_date=att_date
        ).first()

        work_info = getattr(employee, "employee_work_info", None)
        shift = work_info.shift_id if work_info else None
        work_type = work_info.work_type_id if work_info else None

        if existing:
            requested = {
                "attendance_date": attendance_date_str,
                "attendance_clock_in_date": clock_in_date_str,
                "attendance_clock_in": clock_in_str,
                "attendance_clock_out_date": clock_out_date_str if clock_out_str else None,
                "attendance_clock_out": clock_out_str if clock_out_str else None,
            }
            existing.requested_data = _json.dumps(requested)
            existing.request_description = description
            existing.is_validate_request = True
            existing.is_validate_request_approved = False
            existing.request_type = "update_request"
            existing.save()
            return Response({"status": "updated", "id": existing.id}, status=200)
        else:
            att = Attendance(
                employee_id=employee,
                attendance_date=att_date,
                attendance_clock_in_date=date.fromisoformat(clock_in_date_str),
                attendance_clock_in=clock_in_str,
                attendance_clock_out_date=(
                    date.fromisoformat(clock_out_date_str) if clock_out_str else None
                ),
                attendance_clock_out=clock_out_str if clock_out_str else None,
                shift_id=shift,
                work_type_id=work_type,
                request_description=description,
                is_validate_request=True,
                is_validate_request_approved=False,
                request_type="create_request",
            )
            att.save()
            return Response({"status": "created", "id": att.id}, status=201)


class MonthlyAttendanceDetailView(APIView):
    """Per-employee daily attendance matrix for a given month."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        import calendar as _cal
        from employee.models import Employee
        from leave.models import LeaveRequest

        if not request.user.has_perm("attendance.view_attendance"):
            return Response({"error": "Không có quyền"}, status=403)

        month_str = request.GET.get("month", "")
        department_id = request.GET.get("department_id")
        company_id = request.GET.get("company_id")

        try:
            year, month = map(int, month_str.split("-"))
        except (ValueError, AttributeError):
            today_d = date.today()
            year, month = today_d.year, today_d.month

        days_in_month = _cal.monthrange(year, month)[1]
        first_day = date(year, month, 1)
        last_day = date(year, month, days_in_month)
        today_date = date.today()

        emp_qs = (
            Employee.objects.filter(is_active=True)
            .select_related(
                "employee_work_info__department_id",
                "employee_work_info__company_id",
            )
            .order_by("employee_first_name", "employee_last_name")
        )
        if department_id:
            emp_qs = emp_qs.filter(employee_work_info__department_id=department_id)
        if company_id:
            emp_qs = emp_qs.filter(employee_work_info__company_id=company_id)

        emp_ids = list(emp_qs.values_list("id", flat=True))

        # Attendance records
        att_map = {}  # {emp_id: {date: info}}
        for a in Attendance.objects.filter(
            employee_id__in=emp_ids,
            attendance_date__gte=first_day,
            attendance_date__lte=last_day,
        ).values(
            "employee_id", "attendance_date",
            "attendance_clock_in", "attendance_clock_out",
            "minimum_hour", "at_work_second", "overtime_second",
        ):
            eid = a["employee_id"]
            if eid not in att_map:
                att_map[eid] = {}
            att_map[eid][a["attendance_date"]] = a

        # Approved leave requests
        leave_map = {}  # {emp_id: {date: leave_info}}
        for lr in LeaveRequest.objects.filter(
            employee_id__in=emp_ids,
            status="approved",
            start_date__lte=last_day,
            end_date__gte=first_day,
        ).values(
            "employee_id", "start_date", "end_date",
            "leave_type_id__payment", "leave_type_id__name",
        ):
            eid = lr["employee_id"]
            if eid not in leave_map:
                leave_map[eid] = {}
            cur = max(lr["start_date"], first_day)
            end = min(lr["end_date"], last_day)
            while cur <= end:
                leave_map[eid][cur] = lr
                cur += timedelta(days=1)

        weekday_vi = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
        days_header = [
            {
                "day": n,
                "weekday": weekday_vi[date(year, month, n).weekday()],
                "is_weekend": date(year, month, n).weekday() >= 5,
            }
            for n in range(1, days_in_month + 1)
        ]

        employees_data = []
        for emp in emp_qs:
            days_data = {}
            total_cong = 0.0
            for day_num in range(1, days_in_month + 1):
                d = date(year, month, day_num)
                cell = {"check_in": None, "check_out": None, "status": ""}

                is_weekend = d.weekday() >= 5
                att = att_map.get(emp.id, {}).get(d)
                leave = leave_map.get(emp.id, {}).get(d)

                if att:
                    # Always show actual attendance, even on weekends
                    ci = att["attendance_clock_in"]
                    co = att["attendance_clock_out"]
                    cell["check_in"] = ci.strftime("%H:%M") if ci else None
                    cell["check_out"] = co.strftime("%H:%M") if co else None
                    cell["at_work_second"] = att.get("at_work_second") or 0
                    cell["overtime_second"] = att.get("overtime_second") or 0
                    cell["is_weekend"] = is_weekend
                    try:
                        mh, mm = map(int, str(att.get("minimum_hour") or "00:00").split(":"))
                        min_secs = mh * 3600 + mm * 60
                    except Exception:
                        min_secs = 0
                    work_secs = cell["at_work_second"]
                    # Công ngày = giờ làm / mức tối thiểu (9h35 cho ALD26), tối đa 1.0
                    denom = min_secs or 34500
                    if co is None and d < today_date:
                        # Có clock-in nhưng không clock-out ở ngày đã qua → NCO
                        cell["status"] = "nco"
                        cell["cong"] = 0.0
                    else:
                        cell["status"] = "late" if (min_secs > 0 and work_secs < min_secs) else "present"
                        cell["cong"] = round(min(1.0, work_secs / denom), 2)
                elif is_weekend:
                    cell["status"] = "weekend"
                elif d > today_date:
                    cell["status"] = "future"
                elif leave:
                    payment = leave.get("leave_type_id__payment", "unpaid")
                    cell["status"] = "leave" if payment == "paid" else "unpaid"
                    cell["leave_name"] = leave.get("leave_type_id__name", "")
                    if payment == "paid":
                        cell["cong"] = 1.0  # nghỉ phép có lương = đủ công
                else:
                    cell["status"] = "absent"

                total_cong += cell.get("cong") or 0
                days_data[str(day_num)] = cell

            avatar = None
            try:
                if emp.employee_profile:
                    # Root-relative /media/ URL (served by nginx at the public origin).
                    # build_absolute_uri would yield internal http://web:8000.
                    avatar = emp.employee_profile.url
            except Exception:
                pass

            dept_name = ""
            try:
                wi = emp.employee_work_info
                if wi and wi.department_id:
                    dept_name = wi.department_id.department
            except Exception:
                pass

            company_id = None
            company_name = ""
            department_id = None
            try:
                wi = emp.employee_work_info
                if wi:
                    if wi.company_id:
                        company_id = wi.company_id.id
                        company_name = wi.company_id.company
                    if wi.department_id:
                        department_id = wi.department_id.id
            except Exception:
                pass

            employees_data.append({
                "id": emp.id,
                "name": emp.get_full_name(),
                "first_name": emp.employee_first_name or "",
                "last_name": emp.employee_last_name or "",
                "badge_id": emp.badge_id or "",
                "accounting_code": getattr(emp, "accounting_code", "") or "",
                "avatar": avatar,
                "department": dept_name,
                "department_id": department_id,
                "company_id": company_id,
                "company_name": company_name,
                "days": days_data,
                "total_cong": round(total_cong, 2),
            })

        return Response({
            "month_label": f"Tháng {month}/{year}",
            "year": year,
            "month": month,
            "days": days_header,
            "employees": employees_data,
        })


class AttendanceActivityDetailView(APIView):
    """Per-activity clock-in/out detail for one employee on one date (HR view).

    Returns each punch with GPS address, office address, in/out-of-office,
    reason + note, and selfie photo URLs. Same gate as MonthlyAttendanceDetail
    (attendance.view_attendance) since it exposes other employees' GPS + photos.
    """

    permission_classes = [IsAuthenticated]

    _WORK_LOCATION_VI = {
        "in_office": "Trong văn phòng",
        "out_of_office": "Ngoài văn phòng",
    }
    _OUT_TYPE_VI = {
        "remote": "Làm việc từ xa",
        "client": "Tại khách hàng",
        "business_trip": "Công tác",
        "event": "Sự kiện",
        "other": "Khác",
    }

    def get(self, request):
        from attendance.models import AttendanceActivity
        from employee.models import Employee

        # Tự xem (Trang chủ) → mặc định là chính mình, không cần quyền view_attendance.
        # Xem người khác (CC Tháng / C&B) → cần quyền view_attendance.
        me = request.user.employee_get
        employee_id = request.GET.get("employee_id")
        if not employee_id:
            employee_id = getattr(me, "id", None)
        if not employee_id:
            return Response({"error": "Thiếu employee_id"}, status=400)
        is_self = str(employee_id) == str(getattr(me, "id", ""))
        if not is_self and not request.user.has_perm("attendance.view_attendance"):
            return Response({"error": "Không có quyền"}, status=403)

        date_str = request.GET.get("date", "")
        try:
            y, m, d = map(int, date_str.split("-"))
            the_date = date(y, m, d)
        except (ValueError, AttributeError):
            return Response({"error": "date không hợp lệ (YYYY-MM-DD)"}, status=400)

        emp = (
            Employee.objects.filter(id=employee_id)
            .select_related("employee_work_info__company_id")
            .first()
        )
        if not emp:
            return Response({"error": "Không tìm thấy nhân viên"}, status=404)

        # Office address + geofence from the employee's company
        office_address = ""
        office_lat = office_lng = None
        company = None
        try:
            wi = emp.employee_work_info
            company = wi.company_id if wi else None
        except Exception:
            company = None
        if company is not None:
            office_address = (getattr(company, "address", "") or "").strip()
            try:
                from geofencing.models import GeoFencing

                gf = GeoFencing.objects.filter(company_id=company).first()
                if gf:
                    office_lat = gf.latitude
                    office_lng = gf.longitude
            except Exception:
                pass

        def photo_url(f):
            # Return a root-relative /media/ URL so the browser loads it from the
            # public origin via nginx. build_absolute_uri() would yield the internal
            # http://web:8000 host (BFF forwards Host: web:8000), unreachable by the client.
            try:
                return f.url if f else None
            except Exception:
                return None

        def hhmm(t):
            try:
                return t.strftime("%H:%M") if t else None
            except Exception:
                return None

        acts = AttendanceActivity.objects.filter(
            employee_id=emp, attendance_date=the_date
        ).order_by("clock_in", "in_datetime", "id")

        activities = []
        for a in acts:
            wl = a.work_location or ""
            oot = a.out_of_office_type or ""
            activities.append({
                "id": a.id,
                "clock_in": hhmm(a.clock_in),
                "clock_out": hhmm(a.clock_out),
                "clock_in_address": a.clock_in_address or "",
                "clock_out_address": a.clock_out_address or "",
                "clock_in_lat": str(a.clock_in_latitude) if a.clock_in_latitude is not None else None,
                "clock_in_lng": str(a.clock_in_longitude) if a.clock_in_longitude is not None else None,
                "work_location": wl,
                "work_location_label": self._WORK_LOCATION_VI.get(wl, ""),
                "out_of_office_type": oot,
                "out_of_office_label": self._OUT_TYPE_VI.get(oot, ""),
                "out_of_office_note": a.out_of_office_note or "",
                "clock_in_photo": photo_url(a.clock_in_photo),
                "clock_out_photo": photo_url(a.clock_out_photo),
            })

        # Trạng thái NCO + đơn khai báo cho ngày này
        import json as _json
        att = Attendance.objects.filter(employee_id=emp, attendance_date=the_date).first()
        nco = bool(
            att and att.attendance_clock_out is None and att.attendance_clock_in is not None
            and the_date < date.today()
        )
        nco_pending = bool(att and att.is_validate_request and att.request_type == "nco_declare")
        nco_declared_out = None
        if nco_pending:
            try:
                nco_declared_out = _json.loads(att.requested_data or "{}").get("clock_out")
            except Exception:
                nco_declared_out = None

        return Response({
            "employee_id": emp.id,
            "employee_name": emp.get_full_name(),
            "date": the_date.isoformat(),
            "office_name": getattr(company, "company", "") if company else "",
            "office_address": office_address,
            "office_lat": office_lat,
            "office_lng": office_lng,
            "activities": activities,
            "is_nco": nco,
            "nco_pending": nco_pending,
            "nco_declared_clock_out": nco_declared_out,
            "nco_reason": (att.request_description if nco_pending else None),
        })


class NCODeclareView(APIView):
    """Khai báo giờ ra cho ngày NCO. Nhân viên tự khai (self) hoặc C&B khai hộ
    (truyền employee_id + cần quyền attendance.view_attendance). Tạo đơn chờ duyệt."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        import json as _json
        from datetime import time as _time
        from employee.models import Employee

        me = request.user.employee_get
        emp_id = request.data.get("employee_id")
        if emp_id and str(emp_id) != str(getattr(me, "id", "")):
            if not request.user.has_perm("attendance.view_attendance"):
                return Response({"error": "Không có quyền khai báo cho người khác"}, status=403)
            employee = Employee.objects.filter(id=emp_id).first()
        else:
            employee = me
        if not employee:
            return Response({"error": "Không tìm thấy nhân viên"}, status=404)

        date_str = request.data.get("date", "")
        clock_out = (request.data.get("clock_out") or "").strip()
        reason = (request.data.get("reason") or "").strip()
        try:
            y, m, d = map(int, date_str.split("-")); the_date = date(y, m, d)
        except (ValueError, AttributeError):
            return Response({"error": "date không hợp lệ (YYYY-MM-DD)"}, status=400)
        try:
            hh, mm = map(int, clock_out.split(":")); _time(hh, mm)
        except (ValueError, AttributeError):
            return Response({"error": "Giờ ra phải dạng HH:MM"}, status=400)
        if not reason:
            return Response({"error": "Cần nhập lý do khai báo"}, status=400)

        att = Attendance.objects.filter(employee_id=employee, attendance_date=the_date).first()
        if not att:
            return Response({"error": "Không có chấm công ngày này"}, status=404)
        if att.attendance_clock_out:
            return Response({"error": "Ngày này đã có giờ ra"}, status=400)

        att.is_validate_request = True
        att.is_validate_request_approved = False
        att.request_type = "nco_declare"
        att.request_description = reason
        att.requested_data = _json.dumps({"clock_out": clock_out, "reason": reason})
        att.save()
        return Response({"ok": True, "status": "pending", "clock_out": clock_out})


class NCOApproveView(APIView):
    """C&B duyệt đơn khai báo NCO → đóng activity mở + tính lại công + validate."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        import json as _json
        from datetime import time as _time, datetime as _dt
        from employee.models import Employee
        from attendance.methods.utils import format_time

        if not request.user.has_perm("attendance.view_attendance"):
            return Response({"error": "Không có quyền duyệt"}, status=403)
        employee = Employee.objects.filter(id=request.data.get("employee_id")).first()
        if not employee:
            return Response({"error": "Không tìm thấy nhân viên"}, status=404)
        try:
            y, m, d = map(int, str(request.data.get("date", "")).split("-")); the_date = date(y, m, d)
        except (ValueError, AttributeError):
            return Response({"error": "date không hợp lệ"}, status=400)

        att = Attendance.objects.filter(employee_id=employee, attendance_date=the_date).first()
        if not att or not att.is_validate_request or att.request_type != "nco_declare":
            return Response({"error": "Không có đơn khai báo NCO chờ duyệt"}, status=400)
        try:
            data = _json.loads(att.requested_data or "{}")
            hh, mm = map(int, str(data.get("clock_out")).split(":")); cout = _time(hh, mm)
        except Exception:
            return Response({"error": "Dữ liệu khai báo lỗi"}, status=400)

        act = (
            AttendanceActivity.objects.filter(
                employee_id=employee, attendance_date=the_date, clock_out__isnull=True
            ).order_by("-id").first()
        )
        if act:
            act.clock_out = cout
            act.clock_out_date = the_date
            try:
                act.out_datetime = django_tz.make_aware(_dt.combine(the_date, cout))
            except Exception:
                pass
            act.save()

        # Tính công từ các activity trong ngày (recompute_combined_day sẽ override nếu ca một chiều)
        def _s(t):
            return t.hour * 3600 + t.minute * 60 + (t.second or 0) if t else None
        total = 0
        for a in AttendanceActivity.objects.filter(employee_id=employee, attendance_date=the_date):
            ci, co = _s(a.clock_in), _s(a.clock_out)
            if ci is not None and co is not None:
                total += max(0, co - ci)
        att.attendance_worked_hour = format_time(total)
        att.attendance_clock_out = cout
        att.attendance_clock_out_date = the_date
        att.is_validate_request = False
        att.is_validate_request_approved = True
        att.attendance_validated = True
        try:
            att.approved_by = request.user.employee_get
        except Exception:
            pass
        att.save()
        try:
            from attendance.views.clock_in_out import recompute_combined_day
            recompute_combined_day(employee, the_date)
        except Exception:
            pass
        return Response({"ok": True})


class CompanyAttendanceDashboardView(APIView):
    """Company-wide attendance dashboard for managers."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import date, timedelta
        from collections import defaultdict
        from attendance.models import AttendanceLateComeEarlyOut
        from leave.models import LeaveRequest
        from employee.models import Employee

        if not request.user.has_perm("attendance.view_attendance"):
            return Response({"error": "Không có quyền"}, status=403)

        today = date.today()
        period = request.GET.get("period", "month")

        if period == "week":
            start = today - timedelta(days=today.weekday())
            end = today
            label = f"Tuần này ({start.day}/{start.month} – {end.day}/{end.month})"
        elif period == "year":
            start = date(today.year, 1, 1)
            end = today
            label = f"Năm {today.year}"
        else:
            start = date(today.year, today.month, 1)
            end = today
            label = f"Tháng {today.month}/{today.year}"

        # prev period for trend
        delta = (end - start).days + 1
        prev_end = start - timedelta(days=1)
        prev_start = prev_end - timedelta(days=delta - 1)

        # ── Late / early out ──────────────────────────────────────
        lc_qs = AttendanceLateComeEarlyOut.objects.filter(
            attendance_id__attendance_date__range=[start, end],
            is_active=True,
        )
        late_count = lc_qs.count()
        late_prev = AttendanceLateComeEarlyOut.objects.filter(
            attendance_id__attendance_date__range=[prev_start, prev_end],
            is_active=True,
        ).count()

        # ── Approved leave (actual) ───────────────────────────────
        leave_qs = LeaveRequest.objects.filter(
            status="approved",
            start_date__lte=end,
            end_date__gte=start,
            is_active=True,
        )
        actual_leave = leave_qs.count()
        leave_prev = LeaveRequest.objects.filter(
            status="approved",
            start_date__lte=prev_end,
            end_date__gte=prev_start,
            is_active=True,
        ).count()

        # ── Planned leave (future, requested) ─────────────────────
        planned_leave = LeaveRequest.objects.filter(
            status="requested",
            start_date__gte=today,
            is_active=True,
        ).count()

        # ── Monthly trend (12 months back) ───────────────────────
        monthly_trend = []
        for i in range(11, -1, -1):
            if today.month - i <= 0:
                mo = today.month - i + 12
                yr = today.year - 1
            else:
                mo = today.month - i
                yr = today.year
            m_start = date(yr, mo, 1)
            import calendar as cal_mod
            m_end = date(yr, mo, cal_mod.monthrange(yr, mo)[1])
            leave_count = LeaveRequest.objects.filter(
                status="approved",
                start_date__lte=m_end,
                end_date__gte=m_start,
                is_active=True,
            ).count()
            late_c = AttendanceLateComeEarlyOut.objects.filter(
                attendance_id__attendance_date__range=[m_start, m_end],
                is_active=True,
            ).count()
            monthly_trend.append({
                "month": f"T{mo}",
                "leave": leave_count,
                "late": late_c,
            })

        # ── Leave by type ─────────────────────────────────────────
        type_map = defaultdict(int)
        for lr in LeaveRequest.objects.filter(
            status="approved",
            start_date__lte=end,
            end_date__gte=start,
            is_active=True,
        ).select_related("leave_type_id"):
            name = lr.leave_type_id.name if lr.leave_type_id else "Khác"
            type_map[name] += 1

        palette = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"]
        leave_by_type = [
            {"name": k, "count": v, "color": palette[i % len(palette)]}
            for i, (k, v) in enumerate(sorted(type_map.items(), key=lambda x: -x[1]))
        ]

        # ── Leave by department ───────────────────────────────────
        dept_map = defaultdict(int)
        for lr in LeaveRequest.objects.filter(
            status="approved",
            start_date__lte=end,
            end_date__gte=start,
            is_active=True,
        ).select_related("employee_id__employee_work_info__department_id"):
            try:
                dept = lr.employee_id.employee_work_info.department_id
                dept_name = dept.department if dept else "Không rõ"
            except Exception:
                dept_name = "Không rõ"
            dept_map[dept_name] += 1

        leave_by_dept = [
            {"name": k, "count": v}
            for k, v in sorted(dept_map.items(), key=lambda x: -x[1])
        ][:10]

        # ── Top late/early employees ──────────────────────────────
        emp_map = defaultdict(int)
        for lc in AttendanceLateComeEarlyOut.objects.filter(
            attendance_id__attendance_date__range=[start, end],
            is_active=True,
        ).select_related("employee_id__employee_work_info__department_id"):
            emp = lc.employee_id
            if emp:
                emp_map[emp.id] = emp_map.get(emp.id, 0) + 1

        top_late = []
        for emp_id, cnt in sorted(emp_map.items(), key=lambda x: -x[1])[:8]:
            try:
                emp = Employee.objects.select_related(
                    "employee_work_info__department_id"
                ).get(id=emp_id)
                name = emp.get_full_name()
                try:
                    dept = emp.employee_work_info.department_id
                    dept_name = dept.department if dept else ""
                except Exception:
                    dept_name = ""
                initials = "".join(p[0].upper() for p in name.split() if p)[-2:]
                top_late.append({"name": name, "dept": dept_name, "count": cnt, "initials": initials})
            except Exception:
                pass

        return Response({
            "period_label": label,
            "stats": {
                "late_early": {"count": late_count, "trend": late_count - late_prev},
                "actual_leave": {"count": actual_leave, "trend": actual_leave - leave_prev},
                "planned_leave": {"count": planned_leave, "trend": 0},
            },
            "monthly_trend": monthly_trend,
            "leave_by_type": leave_by_type,
            "leave_by_dept": leave_by_dept,
            "top_late_early": top_late,
        })


def _parse_hhmm_to_sec(hhmm: str | None) -> int:
    """Convert 'HH:MM' string to total seconds."""
    if not hhmm:
        return 0
    try:
        parts = str(hhmm).split(":")
        return int(parts[0]) * 3600 + int(parts[1]) * 60
    except (ValueError, IndexError):
        return 0


def _sec_to_hhmm(seconds: int) -> str:
    """Convert total seconds to 'HH:MM' string."""
    h = seconds // 3600
    m = (seconds % 3600) // 60
    return f"{h}:{m:02d}"


class MyMonthCalendarView(APIView):
    """Compact per-day calendar data for the Home page attendance calendar widget.

    Query params: year (int), month (int). Defaults to current month.

    Color status per day:
    - valid:           attendance validated AND worked_sec >= min_sec
    - leave_deducted:  validated AND worked_sec < min_sec AND has approved leave
    - pending:         attendance exists but not yet validated
    - absent:          working day, no attendance, no leave
    - leave:           approved leave, no attendance (shown as planned)
    - off:             weekend / company-off / no shift schedule
    - holiday:         public holiday
    - future:          date in the future
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        import calendar as cal_mod
        from leave.models import LeaveRequest, Holiday, CompanyLeave

        employee = request.user.employee_get
        today = date.today()

        try:
            year = int(request.query_params.get("year", today.year))
            month = int(request.query_params.get("month", today.month))
        except (ValueError, TypeError):
            year, month = today.year, today.month

        _, last_day = cal_mod.monthrange(year, month)
        start = date(year, month, 1)
        end = date(year, month, last_day)

        # Attendance records: first clock-in, last clock-out, total worked_sec per day
        att_map = {}
        for a in Attendance.objects.filter(
            employee_id=employee,
            attendance_date__range=[start, end],
        ).order_by("attendance_date", "attendance_clock_in"):
            d = a.attendance_date.isoformat()
            if d not in att_map:
                att_map[d] = {
                    "clock_in": a.attendance_clock_in,
                    "clock_out": a.attendance_clock_out,
                    "worked_sec": a.at_work_second or 0,
                    "min_sec": _parse_hhmm_to_sec(a.minimum_hour),
                    "validated": a.attendance_validated,
                }
            else:
                entry = att_map[d]
                if a.attendance_clock_out:
                    entry["clock_out"] = a.attendance_clock_out
                entry["worked_sec"] += a.at_work_second or 0
                if not a.attendance_validated:
                    entry["validated"] = False

        # AttendanceActivity: gom MỌI lượt chấm/ngày → lượt đầu = giờ vào ca,
        # lượt cuối = giờ ra ca (ALD26: lượt thứ >2 cập nhật giờ ra ca theo lượt mới
        # nhất, kể cả lượt lẻ). 1 lượt → chỉ có giờ vào (NCO).
        act_punch_map = {}
        for act in AttendanceActivity.objects.filter(
            employee_id=employee,
            attendance_date__range=[start, end],
        ).order_by("attendance_date", "clock_in"):
            d = act.attendance_date.isoformat()
            lst = act_punch_map.setdefault(d, [])
            if act.clock_in:
                lst.append(act.clock_in)
            if act.clock_out:
                lst.append(act.clock_out)
        act_map = {}
        for d, lst in act_punch_map.items():
            punches = sorted(lst)
            act_map[d] = {
                "first_in": punches[0] if punches else None,
                "last_out": punches[-1] if len(punches) >= 2 else None,
            }

        # Leaves (approved + pending "requested")
        leave_map = {}
        for lr in LeaveRequest.objects.filter(
            employee_id=employee,
            start_date__lte=end,
            end_date__gte=start,
            status__in=["approved", "requested"],
        ).select_related("leave_type_id").order_by("start_date"):
            lt = lr.leave_type_id
            name = lt.name if lt else "Nghỉ phép"
            d = lr.start_date
            while d <= (lr.end_date or lr.start_date):
                if start <= d <= end:
                    iso = d.isoformat()
                    if iso not in leave_map or lr.status == "approved":
                        leave_map[iso] = {"name": name, "status": lr.status}
                d += timedelta(days=1)

        # Shift schedule → which weekdays are working days
        work_info = getattr(employee, "employee_work_info", None)
        shift = work_info.shift_id if work_info else None
        working_weekdays = None  # None = all days (fallback)
        if shift:
            DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            working_weekdays = set()
            for s in EmployeeShiftSchedule.objects.filter(shift_id=shift).select_related("day"):
                dn = s.day.day if s.day else None
                if dn and dn in DAY_NAMES:
                    working_weekdays.add(DAY_NAMES.index(dn))

        # Company-level off days (recurring weekly)
        company_off_days = set()
        try:
            for cl in CompanyLeave.objects.all():
                if cl.based_on_week_day is not None:
                    company_off_days.add(int(cl.based_on_week_day))
        except Exception:
            pass

        # Holidays
        holiday_dates = set()
        for h in Holiday.objects.filter(start_date__lte=end, end_date__gte=start):
            d = h.start_date
            while d <= (h.end_date or h.start_date):
                if start <= d <= end:
                    holiday_dates.add(d.isoformat())
                d += timedelta(days=1)

        # Shift plans for future days
        shift_plan_map = {}
        try:
            from attendance.models import EmployeeShiftPlan
            from collections import defaultdict
            future_start = start
            if future_start <= end:
                _DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
                plans = list(EmployeeShiftPlan.objects.filter(
                    employee_id=employee,
                    date__range=[max(start, future_start), end],
                ).select_related("shift"))
                plan_shift_ids = {p.shift_id for p in plans}
                sched_by_shift = defaultdict(dict)
                for sched in EmployeeShiftSchedule.objects.filter(
                    shift_id__in=plan_shift_ids
                ).select_related("day"):
                    dn = sched.day.day if sched.day else None
                    if dn and dn in _DAY_NAMES:
                        idx = _DAY_NAMES.index(dn)
                        sched_by_shift[sched.shift_id_id][idx] = (
                            sched.start_time.strftime("%H:%M") if sched.start_time else None,
                            sched.end_time.strftime("%H:%M") if sched.end_time else None,
                        )
                for plan in plans:
                    d_iso = plan.date.isoformat()
                    wday = plan.date.weekday()
                    st, et = sched_by_shift[plan.shift_id].get(wday, (None, None))
                    if d_iso not in shift_plan_map:
                        shift_plan_map[d_iso] = []
                    shift_plan_map[d_iso].append({
                        "name": plan.shift.employee_shift if plan.shift_id else "",
                        "start": st,
                        "end": et,
                    })
                for d_iso in shift_plan_map:
                    shift_plan_map[d_iso].sort(key=lambda x: x.get("start") or "99:99")
        except Exception:
            pass

        days = []
        for day_num in range(1, last_day + 1):
            d = date(year, month, day_num)
            d_iso = d.isoformat()
            is_future = d > today
            is_holiday = d_iso in holiday_dates
            is_off = (
                d.weekday() in company_off_days
                or (working_weekdays is not None and d.weekday() not in working_weekdays)
            )

            att = att_map.get(d_iso)
            act = act_map.get(d_iso)
            leave = leave_map.get(d_iso)

            if act:
                first_in = act["first_in"].strftime("%H:%M") if act["first_in"] else None
                last_out = act["last_out"].strftime("%H:%M") if act.get("last_out") else None
            elif att:
                first_in = att["clock_in"].strftime("%H:%M") if att["clock_in"] else None
                last_out = att["clock_out"].strftime("%H:%M") if att["clock_out"] else None
            else:
                first_in = None
                last_out = None

            worked_sec = att["worked_sec"] if att else 0
            min_sec = att["min_sec"] if att else 0
            worked_str = _sec_to_hhmm(worked_sec) if worked_sec else None

            # Determine color status
            if is_future:
                color_status = "future"
            elif is_holiday:
                color_status = "holiday"
            elif att:
                if att.get("clock_out") is None and d < today:
                    color_status = "nco"
                elif not att["validated"]:
                    color_status = "pending"
                elif min_sec > 0 and worked_sec < min_sec and leave and leave["status"] == "approved":
                    color_status = "leave_deducted"
                else:
                    color_status = "valid"
            elif leave and leave["status"] == "approved":
                color_status = "leave"
            elif leave and leave["status"] == "requested":
                color_status = "leave_pending"
            elif not is_off:
                color_status = "absent"
            else:
                color_status = "off"

            days.append({
                "date": d_iso,
                "day": day_num,
                "weekday": d.weekday(),
                "color_status": color_status,
                "first_in": first_in,
                "last_out": last_out,
                "worked_hours": worked_str,
                "leave_name": leave["name"] if leave else None,
                "leave_status": leave["status"] if leave else None,
                "shift_plan": shift_plan_map.get(d_iso) if is_future else None,
                "shift_plans": shift_plan_map.get(d_iso, []),
            })

        return Response({
            "year": year,
            "month": month,
            "today": today.isoformat(),
            "days": days,
        })


class MyTodayShiftDetailView(APIView):
    """Per-shift attendance detail for today — used by Home card."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from attendance.models import EmployeeShiftPlan
        from base.models import EmployeeShift

        employee = request.user.employee_get
        tz = django_tz.get_current_timezone()
        now_local = django_tz.localtime(django_tz.now(), tz)
        today = now_local.date()

        # --- Gather shifts assigned today ---
        plans = list(
            EmployeeShiftPlan.objects.filter(
                employee=employee, date=today,
            ).select_related("shift")
        )

        if plans:
            shifts = [p.shift for p in plans]
        else:
            wi = getattr(employee, "employee_work_info", None)
            default_shift = wi.shift_id if wi and wi.shift_id else None
            shifts = [default_shift] if default_shift else []

        day_name = [
            "monday", "tuesday", "wednesday", "thursday", "friday",
            "saturday", "sunday",
        ][today.weekday()]

        # --- Build per-shift rows ---
        activities = list(
            AttendanceActivity.objects.filter(
                employee_id=employee, attendance_date=today,
            ).order_by("clock_in")
        )

        # ===== ALD26: mô hình lượt phẳng — giờ công = span (lượt cuối − lượt đầu),
        # tối thiểu 9h35 = công đủ ngày. Last = lượt chấm cuối (kể cả lượt mở). =====
        # Nhận diện ALD26 từ CA ĐƯỢC GÁN (work_info.shift_id) trước — KHÔNG phụ thuộc
        # EmployeeShiftPlan (nhiều NV còn sót plan ca cũ HCS26/HCC26 hôm nay → nếu chỉ
        # xét `shifts` sẽ bỏ nhánh ALD26 và rơi về tính ca cũ sai). ALD26 là ca toàn cty.
        _wi = getattr(employee, "employee_work_info", None)
        _assigned = _wi.shift_id if _wi and _wi.shift_id else None
        ald26 = (
            _assigned if (_assigned and getattr(_assigned, "employee_shift", "") == "ALD26")
            else next((sh for sh in shifts if sh and getattr(sh, "employee_shift", "") == "ALD26"), None)
        )
        if ald26:
            def _csec(t):
                return t.hour * 3600 + t.minute * 60 + (t.second or 0) if t else None

            def _hhmm(sec):
                sec = int(sec) % 86400
                return f"{sec // 3600:02d}:{(sec % 3600) // 60:02d}"

            punches = sorted(
                s for a in activities for s in (_csec(a.clock_in), _csec(a.clock_out)) if s is not None
            )
            exp_sec = 34500  # 9h35
            sched = EmployeeShiftSchedule.objects.filter(shift_id=ald26, day__day=day_name).first()
            if sched and sched.minimum_working_hour:
                try:
                    hh, mm = str(sched.minimum_working_hour).split(":")[:2]
                    exp_sec = int(hh) * 3600 + int(mm) * 60
                except Exception:
                    exp_sec = 34500
            worked_sec = max(0, punches[-1] - punches[0]) if len(punches) >= 2 else 0
            first_p = punches[0] if punches else None
            last_p = punches[-1] if len(punches) >= 2 else None
            status = "completed" if len(punches) >= 2 else ("in_progress" if punches else "pending")
            row = {
                "shift_name": "ALD26",
                "start_time": "00:00", "end_time": "23:58", "coefficient": 1,
                "activities": ([{
                    "clock_in": _hhmm(first_p) if first_p is not None else None,
                    "clock_out": _hhmm(last_p) if last_p is not None else None,
                }] if first_p is not None else []),
                "worked_minutes": round(worked_sec / 60),
                "expected_minutes": round(exp_sec / 60),
                "status": status, "check_mode": "both",
            }
            return Response({
                "date": today.isoformat(),
                "shifts": [row],
                "total_worked_minutes": round(worked_sec / 60),
                "total_expected_minutes": round(exp_sec / 60),
                "progress_pct": min(100, round(worked_sec / exp_sec * 100, 1)) if exp_sec > 0 else 0,
            })

        shift_rows = []
        total_worked = 0
        total_expected = 0

        for shift in shifts:
            if not shift:
                continue
            schedules = list(
                EmployeeShiftSchedule.objects.filter(
                    shift_id=shift,
                    day__day=day_name,
                )
            )
            if not schedules:
                continue

            for sched in schedules:
                start = sched.start_time
                end = sched.end_time
                coeff = float(sched.work_day_coefficient or 1)

                start_sec = start.hour * 3600 + start.minute * 60
                end_sec = end.hour * 3600 + end.minute * 60
                if end_sec <= start_sec:
                    end_sec += 86400

                expected_min = (end_sec - start_sec) / 60
                window_one = max(0, end_sec - start_sec)
                mode = getattr(sched, "check_mode", "both")

                def _csec(t):
                    return t.hour * 3600 + t.minute * 60 if t else None

                def _hhmm(sec):
                    sec = int(sec) % 86400
                    return f"{sec // 3600:02d}:{(sec % 3600) // 60:02d}"

                worked_min = 0
                act_rows = []
                s = "pending"

                if mode == "clock_in_only":
                    # Ca chỉ chấm vào: coi giờ ra = hết ca (cap), không cần clock-out
                    ins = sorted(
                        _csec(a.clock_in) for a in activities
                        if a.clock_in and start_sec - 1800 <= _csec(a.clock_in) <= end_sec
                    )
                    if ins:
                        worked_min = min(window_one, max(0, end_sec - max(ins[0], start_sec))) / 60
                        act_rows = [{"clock_in": _hhmm(ins[0]), "clock_out": end.strftime("%H:%M")}]
                        s = "completed"
                elif mode == "clock_out_only":
                    # Ca chỉ chấm ra: coi giờ vào = đầu ca (cap), không cần clock-in
                    outs = sorted(
                        _csec(a.clock_out) for a in activities
                        if a.clock_out and start_sec <= _csec(a.clock_out) <= end_sec + 1800
                    )
                    if outs:
                        worked_min = min(window_one, max(0, min(outs[-1], end_sec) - start_sec)) / 60
                        act_rows = [{"clock_in": start.strftime("%H:%M"), "clock_out": _hhmm(outs[-1])}]
                        s = "completed"
                else:
                    window_start = max(0, start_sec - 1800)
                    window_end = end_sec + 1800
                    matched = []
                    for act in activities:
                        ci_sec = act.clock_in.hour * 3600 + act.clock_in.minute * 60
                        if window_start <= ci_sec <= window_end:
                            matched.append(act)
                    for act in matched:
                        ci = act.clock_in.strftime("%H:%M") if act.clock_in else None
                        co = act.clock_out.strftime("%H:%M") if act.clock_out else None
                        if act.clock_in and act.clock_out:
                            ci_dt = datetime.combine(today, act.clock_in)
                            co_dt = datetime.combine(
                                act.clock_out_date or today, act.clock_out
                            )
                            mins = (co_dt - ci_dt).total_seconds() / 60
                            worked_min += max(0, mins)
                        elif act.clock_in and not act.clock_out:
                            ci_dt = datetime.combine(today, act.clock_in)
                            mins = (now_local - tz.localize(ci_dt)).total_seconds() / 60
                            worked_min += max(0, mins)
                        act_rows.append({"clock_in": ci, "clock_out": co})
                    if not matched:
                        s = "pending"
                    elif any(a.clock_in and not a.clock_out for a in matched):
                        s = "in_progress"
                    else:
                        s = "completed"

                total_worked += worked_min
                total_expected += expected_min

                shift_rows.append({
                    "shift_name": shift.employee_shift,
                    "start_time": start.strftime("%H:%M"),
                    "end_time": end.strftime("%H:%M"),
                    "coefficient": coeff,
                    "activities": act_rows,
                    "worked_minutes": round(worked_min),
                    "expected_minutes": round(expected_min),
                    "status": s,
                    "check_mode": mode,
                })

        # Gộp ca một chiều: NV có cả clock_in_only + clock_out_only → 1 dòng,
        # chỉ hiện giờ check-in (ca vào) → giờ check-out (ca ra), bỏ tên ca.
        in_only = [r for r in shift_rows if r.get("check_mode") == "clock_in_only"]
        out_only = [r for r in shift_rows if r.get("check_mode") == "clock_out_only"]
        if in_only and out_only:
            others = [r for r in shift_rows if r.get("check_mode") not in ("clock_in_only", "clock_out_only")]
            ci = next((a["clock_in"] for r in in_only for a in r["activities"] if a.get("clock_in")), None)
            co = next((a["clock_out"] for r in reversed(out_only) for a in reversed(r["activities"]) if a.get("clock_out")), None)
            combined = {
                "shift_name": "",
                "start_time": in_only[0]["start_time"],
                "end_time": out_only[-1]["end_time"],
                "coefficient": 1,
                "activities": [{"clock_in": ci, "clock_out": co}],
                "worked_minutes": sum(r["worked_minutes"] for r in in_only + out_only),
                "expected_minutes": sum(r["expected_minutes"] for r in in_only + out_only),
                "status": "completed" if (ci and co) else ("in_progress" if (ci or co) else "pending"),
                "check_mode": "combined",
            }
            shift_rows = others + [combined]

        progress = round(total_worked / total_expected * 100, 1) if total_expected > 0 else 0

        return Response({
            "date": today.isoformat(),
            "shifts": shift_rows,
            "total_worked_minutes": round(total_worked),
            "total_expected_minutes": round(total_expected),
            "progress_pct": min(100, progress),
        })


# ── Manager Punch Matrix ──────────────────────────────────────────────────────

def _get_subordinate_ids(manager_emp):
    """BFS across the org tree; returns set of employee IDs under manager_emp."""
    from employee.models import Employee
    result = set()
    frontier = [manager_emp.id]
    while frontier:
        direct = list(
            Employee.objects.filter(
                employee_work_info__reporting_manager_id__in=frontier,
                is_active=True,
            ).values_list("id", flat=True)
        )
        new = set(direct) - result
        result |= new
        frontier = list(new)
    return result


class ManagerPunchMatrixView(APIView):
    """GET /api/attendance/manager-punch-matrix/

    Returns first-in / last-out from AttendanceActivity per employee per day
    for the requesting manager's org subtree (recursive).

    Query params:
      month        YYYY-MM  (default: current month)
      department_id
      company_id
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        import calendar as _cal
        from employee.models import Employee

        month_str = request.GET.get("month", "")
        dept_filter = request.GET.get("department_id")
        comp_filter = request.GET.get("company_id")

        try:
            year, month = map(int, month_str.split("-"))
        except (ValueError, AttributeError):
            _today = date.today()
            year, month = _today.year, _today.month

        days_in_month = _cal.monthrange(year, month)[1]
        first_day = date(year, month, 1)
        last_day  = date(year, month, days_in_month)
        today_date = date.today()

        try:
            manager_emp = request.user.employee_get
        except Exception:
            return Response({"error": "Không tìm thấy thông tin nhân viên"}, status=400)

        has_hr_perm = request.user.has_perm("attendance.view_attendance")
        if has_hr_perm:
            sub_ids = None  # HR sees everyone
        else:
            sub_ids = _get_subordinate_ids(manager_emp)
            if not sub_ids:
                weekday_vi = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
                return Response({
                    "year": year, "month": month,
                    "days": [
                        {"day": n, "weekday": weekday_vi[date(year, month, n).weekday()],
                         "is_weekend": date(year, month, n).weekday() >= 5}
                        for n in range(1, days_in_month + 1)
                    ],
                    "employees": [],
                })

        emp_qs = (
            Employee.objects.filter(is_active=True)
            .select_related(
                "employee_work_info__department_id",
                "employee_work_info__company_id",
            )
            .order_by(
                "employee_work_info__department_id__department",
                "employee_first_name", "employee_last_name",
            )
        )
        if sub_ids is not None:
            emp_qs = emp_qs.filter(id__in=sub_ids)
        if dept_filter:
            emp_qs = emp_qs.filter(employee_work_info__department_id=dept_filter)
        if comp_filter:
            emp_qs = emp_qs.filter(employee_work_info__company_id=comp_filter)

        emp_ids = list(emp_qs.values_list("id", flat=True))

        # Collect AttendanceActivity punches per (employee, date)
        punch_map: dict = {}  # {emp_id: {date: [(type, time)]}}
        for act in AttendanceActivity.objects.filter(
            employee_id__in=emp_ids,
            attendance_date__gte=first_day,
            attendance_date__lte=last_day,
        ).values("employee_id", "attendance_date", "clock_in", "clock_out").order_by(
            "employee_id", "attendance_date", "clock_in"
        ):
            eid = act["employee_id"]
            d   = act["attendance_date"]
            punch_map.setdefault(eid, {}).setdefault(d, [])
            if act["clock_in"]:
                punch_map[eid][d].append(("in",  act["clock_in"]))
            if act["clock_out"]:
                punch_map[eid][d].append(("out", act["clock_out"]))

        weekday_vi = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
        days_header = [
            {
                "day": n,
                "weekday": weekday_vi[date(year, month, n).weekday()],
                "is_weekend": date(year, month, n).weekday() >= 5,
            }
            for n in range(1, days_in_month + 1)
        ]

        employees_data = []
        for emp in emp_qs:
            emp_punches = punch_map.get(emp.id, {})
            days_data: dict = {}

            for day_num in range(1, days_in_month + 1):
                d = date(year, month, day_num)
                is_weekend = d.weekday() >= 5
                is_future  = d > today_date
                punches    = emp_punches.get(d, [])

                all_times = sorted(t for _, t in punches)
                first_in  = all_times[0].strftime("%H:%M") if all_times else None
                last_out  = all_times[-1].strftime("%H:%M") if len(all_times) >= 2 else None

                days_data[str(day_num)] = {
                    "first_in":    first_in,
                    "last_out":    last_out,
                    "punch_count": len(punches),
                    "is_weekend":  is_weekend,
                    "is_future":   is_future,
                }

            avatar = None
            try:
                if emp.employee_profile:
                    avatar = emp.employee_profile.url
            except Exception:
                pass

            dept_name = dept_id_val = comp_id_val = comp_name = ""
            dept_id_val = comp_id_val = None
            try:
                wi = emp.employee_work_info
                if wi:
                    if wi.department_id:
                        dept_name  = wi.department_id.department
                        dept_id_val = wi.department_id.id
                    if wi.company_id:
                        comp_id_val = wi.company_id.id
                        comp_name   = wi.company_id.company
            except Exception:
                pass

            employees_data.append({
                "id":             emp.id,
                "name":           emp.get_full_name(),
                "first_name":     emp.employee_first_name or "",
                "last_name":      emp.employee_last_name  or "",
                "badge_id":       emp.badge_id            or "",
                "employee_code":  getattr(emp, "employee_code", "")  or "",
                "accounting_code":getattr(emp, "accounting_code", "") or "",
                "avatar":         avatar,
                "department":     dept_name,
                "department_id":  dept_id_val,
                "company_id":     comp_id_val,
                "company_name":   comp_name,
                "days":           days_data,
            })

        return Response({
            "year": year, "month": month,
            "days": days_header,
            "employees": employees_data,
        })


class ManagerPunchDetailView(APIView):
    """GET /api/attendance/manager-punch-detail/?employee_id=&date=YYYY-MM-DD

    Returns all punch events for one employee on one date.
    Accessible by the employee's manager (any level) or HR.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from employee.models import Employee

        employee_id = request.GET.get("employee_id")
        date_str    = request.GET.get("date", "")

        if not employee_id or not date_str:
            return Response({"error": "employee_id và date là bắt buộc"}, status=400)

        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            return Response({"error": "date không hợp lệ (YYYY-MM-DD)"}, status=400)

        try:
            manager_emp = request.user.employee_get
        except Exception:
            return Response({"error": "Không tìm thấy thông tin nhân viên"}, status=400)

        eid = int(employee_id)
        is_self = eid == getattr(manager_emp, "id", None)
        if not is_self and not request.user.has_perm("attendance.view_attendance"):
            sub_ids = _get_subordinate_ids(manager_emp)
            if eid not in sub_ids:
                return Response({"error": "Không có quyền xem nhân viên này"}, status=403)

        emp = Employee.objects.filter(id=eid).first()
        if not emp:
            return Response({"error": "Không tìm thấy nhân viên"}, status=404)

        activities = AttendanceActivity.objects.filter(
            employee_id=emp,
            attendance_date=target_date,
        ).order_by("clock_in")

        punches = []
        for act in activities:
            if act.clock_in:
                punches.append({"time": act.clock_in.strftime("%H:%M"), "type": "in"})
            if act.clock_out:
                punches.append({"time": act.clock_out.strftime("%H:%M"), "type": "out"})
        punches.sort(key=lambda x: x["time"])

        return Response({
            "employee_id":   emp.id,
            "employee_name": emp.get_full_name(),
            "badge_id":      emp.badge_id or "",
            "date":          date_str,
            "punches":       punches,
        })
