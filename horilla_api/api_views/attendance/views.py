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
    """Check if employee has an open AttendanceActivity (no clock_out) within the last 2 days.
    Activities older than 2 days without clock_out are considered dangling and ignored.
    """
    cutoff = date.today() - timedelta(days=2)
    activity = (
        AttendanceActivity.objects.filter(
            employee_id=employee,
            attendance_date__gte=cutoff,
        )
        .order_by("-id")
        .first()
    )
    return activity is not None and activity.clock_out_date is None


class ClockInAPIView(APIView):
    """
    Allows authenticated employees to clock in, determining the correct shift and attendance date, including handling night shifts.

    Methods:
        post(request): Processes and records the clock-in time.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
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
            from base.models import Company

            office_id = request.data.get("office_id")
            if office_id:
                try:
                    company = Company.objects.get(id=office_id)
                except Company.DoesNotExist:
                    company = employee.get_company()
            else:
                company = employee.get_company()

            inside, distance_m, _ = check_geofence(lat, lng, company)
            if inside:
                attendance.attendance_validated = True
                attendance.save(update_fields=["attendance_validated"])
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
        if _is_clocked_in(request.user.employee_get):
            employee = request.user.employee_get
            local_now = django_tz.localtime(django_tz.now())

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
        """Save GPS + selfie photo to the just-closed AttendanceActivity."""
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
        if updates:
            activity.save(update_fields=updates)

    @staticmethod
    def _check_geofence(request):
        """Check GPS against company geofence on clock-out.
        If outside, force attendance_validated=False."""
        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        if lat is None or lng is None:
            return None
        try:
            from geofencing.utils import check_geofence

            employee = request.user.employee_get
            company = employee.get_company()
            inside, distance_m, _ = check_geofence(lat, lng, company)
            attendance = (
                Attendance.objects.filter(employee_id=employee)
                .order_by("-attendance_date", "-id")
                .first()
            )
            if attendance:
                if inside:
                    pass
                else:
                    attendance.attendance_validated = False
                    attendance.save(update_fields=["attendance_validated"])
            return inside
        except Exception:
            return None


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

    def get(self, request):
        attendance_activity = (
            AttendanceActivity.objects.filter(employee_id=request.user.employee_get)
            .order_by("-id")
            .first()
        )
        duration = None
        work_seconds = request.user.employee_get.get_forecasted_at_work()[
            "forecasted_at_work_seconds"
        ]
        duration = CheckingStatus._format_seconds(int(work_seconds))
        status = False
        clock_in_time = None

        today = datetime.now()
        attendance_activity_first = (
            AttendanceActivity.objects.filter(
                employee_id=request.user.employee_get, clock_in_date=today
            )
            .order_by("in_datetime")
            .first()
        )
        if attendance_activity:
            try:
                clock_in_time = attendance_activity_first.clock_in.strftime("%H:%M")
                clock_in_iso = None
                if attendance_activity_first.in_datetime:
                    clock_in_iso = attendance_activity_first.in_datetime.isoformat()
                if attendance_activity.clock_out_date:
                    status = False
                    clock_out_time = None
                    try:
                        clock_out_time = attendance_activity.clock_out.strftime("%H:%M")
                    except Exception:
                        pass
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
                else:
                    status = True
                    return Response(
                        {
                            "status": status,
                            "duration": duration,
                            "clock_in": clock_in_time,
                            "clock_in_iso": clock_in_iso,
                            "clock_out": None,
                        },
                        status=200,
                    )
            except Exception:
                return Response(
                    {"status": status, "duration": duration, "clock_in": clock_in_time, "clock_out": None},
                    status=200,
                )
        return Response(
            {"status": status, "duration": duration, "clock_in": None, "clock_out": None},
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
            "minimum_hour", "at_work_second",
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
            for day_num in range(1, days_in_month + 1):
                d = date(year, month, day_num)
                cell = {"check_in": None, "check_out": None, "status": ""}

                if d.weekday() >= 5:
                    cell["status"] = "weekend"
                elif d > today_date:
                    cell["status"] = "future"
                else:
                    att = att_map.get(emp.id, {}).get(d)
                    leave = leave_map.get(emp.id, {}).get(d)

                    if att:
                        ci = att["attendance_clock_in"]
                        co = att["attendance_clock_out"]
                        cell["check_in"] = ci.strftime("%H:%M") if ci else None
                        cell["check_out"] = co.strftime("%H:%M") if co else None
                        try:
                            mh, mm = map(int, str(att.get("minimum_hour") or "00:00").split(":"))
                            min_secs = mh * 3600 + mm * 60
                        except Exception:
                            min_secs = 0
                        work_secs = att.get("at_work_second") or 0
                        cell["status"] = "late" if (min_secs > 0 and work_secs < min_secs) else "present"
                    elif leave:
                        payment = leave.get("leave_type_id__payment", "unpaid")
                        cell["status"] = "leave" if payment == "paid" else "unpaid"
                        cell["leave_name"] = leave.get("leave_type_id__name", "")
                    else:
                        cell["status"] = "absent"

                days_data[str(day_num)] = cell

            avatar = None
            try:
                if emp.employee_profile:
                    avatar = request.build_absolute_uri(emp.employee_profile.url)
            except Exception:
                pass

            dept_name = ""
            try:
                wi = emp.employee_work_info
                if wi and wi.department_id:
                    dept_name = wi.department_id.department
            except Exception:
                pass

            employees_data.append({
                "id": emp.id,
                "name": emp.get_full_name(),
                "avatar": avatar,
                "department": dept_name,
                "days": days_data,
            })

        return Response({
            "month_label": f"Tháng {month}/{year}",
            "year": year,
            "month": month,
            "days": days_header,
            "employees": employees_data,
        })


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
