"""
clock_in_out.py

This module is used register endpoints to the check-in check-out functionalities
"""

import ipaddress
import logging

from django.shortcuts import render

logger = logging.getLogger(__name__)
from datetime import date, datetime, timedelta

from django.contrib import messages
from django.db.models import Q
from django.http import HttpResponse
from django.utils.translation import gettext_lazy as _

from attendance.methods.utils import (
    activity_datetime,
    employee_exists,
    format_time,
    overtime_calculation,
    shift_schedule_today,
    strtime_seconds,
)
from attendance.models import (
    Attendance,
    AttendanceActivity,
    AttendanceGeneralSetting,
    AttendanceLateComeEarlyOut,
    GraceTime,
)
from attendance.views.views import attendance_validate
from base.context_processors import (
    enable_late_come_early_out_tracking,
    timerunner_enabled,
)
from base.models import AttendanceAllowedIP, Company, EmployeeShiftDay
from horilla.decorators import hx_request_required, login_required
from horilla.horilla_middlewares import _thread_locals


def late_come_create(attendance):
    """
    used to create late come report
    args:
        attendance : attendance object
    """

    if AttendanceLateComeEarlyOut.objects.filter(
        type="late_come", attendance_id=attendance
    ).exists():
        late_come_obj = AttendanceLateComeEarlyOut.objects.filter(
            type="late_come", attendance_id=attendance
        ).first()
    else:
        late_come_obj = AttendanceLateComeEarlyOut()

    late_come_obj.type = "late_come"
    late_come_obj.attendance_id = attendance
    late_come_obj.employee_id = attendance.employee_id
    late_come_obj.save()
    return late_come_obj


def late_come(attendance, start_time, end_time, shift):
    """
    this method is used to mark the late check-in  attendance after the shift starts
    args:
        attendance : attendance obj
        start_time : attendance day shift start time
        end_time : attendance day shift end time

    """
    if not enable_late_come_early_out_tracking(None).get("tracking"):
        return
    request = getattr(_thread_locals, "request", None)
    now_sec = strtime_seconds(attendance.attendance_clock_in.strftime("%H:%M"))
    mid_day_sec = strtime_seconds("12:00")

    # Checking gracetime allowance before creating late come
    if shift and shift.grace_time_id:
        # checking grace time in shift, it has the higher priority
        if (
            shift.grace_time_id.is_active == True
            and shift.grace_time_id.allowed_clock_in == True
        ):
            # Setting allowance for the check in time
            now_sec -= shift.grace_time_id.allowed_time_in_secs
    # checking default grace time
    elif GraceTime.objects.filter(is_default=True, is_active=True).exists():
        grace_time = GraceTime.objects.filter(
            is_default=True,
            is_active=True,
        ).first()
        # Setting allowance for the check in time if grace allocate for clock in event
        if grace_time.allowed_clock_in:
            now_sec -= grace_time.allowed_time_in_secs
    else:
        pass
    if start_time > end_time and start_time != end_time:
        # night shift
        if now_sec < mid_day_sec:
            # Here  attendance or attendance activity for new day night shift
            late_come_create(attendance)
        elif now_sec > start_time:
            # Here  attendance or attendance activity for previous day night shift
            late_come_create(attendance)
    elif start_time < now_sec:
        late_come_create(attendance)
    return True


def clock_in_attendance_and_activity(
    employee,
    date_today,
    attendance_date,
    day,
    now,
    shift,
    minimum_hour,
    start_time,
    end_time,
    in_datetime,
):
    """
    This method is used to create attendance activity or attendance when an employee clocks-in
    args:
        employee        : employee instance
        date_today      : date
        attendance_date : the date that attendance for
        day             : shift day
        now             : current time
        shift           : shift object
        minimum_hour    : minimum hour in shift schedule
        start_time      : start time in shift schedule
        end_time        : end time in shift schedule
    """

    # attendance activity create
    activity = AttendanceActivity.objects.filter(
        employee_id=employee,
        attendance_date=attendance_date,
        clock_in_date=date_today,
        shift_day=day,
        clock_out=None,
    ).first()

    if activity and not activity.clock_out:
        activity.clock_out = in_datetime
        activity.clock_out_date = date_today
        activity.out_datetime = in_datetime
        activity.save()

    new_activity = AttendanceActivity.objects.create(
        employee_id=employee,
        attendance_date=attendance_date,
        clock_in_date=date_today,
        shift_day=day,
        clock_in=in_datetime,
        in_datetime=in_datetime,
    )
    # create attendance if not exist
    attendance = Attendance.objects.filter(
        employee_id=employee, attendance_date=attendance_date
    )
    if not attendance.exists():
        attendance = Attendance()
        attendance.employee_id = employee
        attendance.shift_id = shift
        work_info = getattr(employee, "employee_work_info", None)
        attendance.work_type_id = getattr(work_info, "work_type_id", None)
        attendance.attendance_date = attendance_date
        attendance.attendance_day = day
        attendance.attendance_clock_in = now
        attendance.attendance_clock_in_date = date_today
        attendance.minimum_hour = minimum_hour
        attendance.save()
        # check here late come or not

        attendance = Attendance.find(attendance.id)
        late_come(
            attendance=attendance, start_time=start_time, end_time=end_time, shift=shift
        )
    else:
        attendance = attendance[0]
        attendance.attendance_clock_out = None
        attendance.attendance_clock_out_date = None
        attendance.save()
        # delete if the attendance marked the early out
        early_out_instance = attendance.late_come_early_out.filter(type="early_out")
        if early_out_instance.exists():
            early_out_instance[0].delete()
    try:
        recompute_day(employee, attendance_date)
    except Exception:
        logger.exception("recompute_day (clock-in) failed")
    return attendance


def do_clock_in(employee, datetime_override=None):
    """
    Core clock-in logic extracted for reuse (PWA, biometric, API).
    Returns (attendance, error_string). On success error_string is None.
    """
    work_info = employee.employee_work_info
    if work_info is None:
        return None, "Employee has no work information"

    shift = work_info.shift_id
    if datetime_override:
        datetime_now = datetime_override
        date_today = datetime_now.date() if hasattr(datetime_now, "date") else date.today()
        now = datetime_now.strftime("%H:%M")
    else:
        datetime_now = datetime.now()
        date_today = date.today()
        now = datetime_now.strftime("%H:%M")

    attendance_date = date_today
    day = date_today.strftime("%A").lower()
    day = EmployeeShiftDay.objects.get(day=day)
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
            minimum_hour, start_time_sec, end_time_sec = shift_schedule_today(
                day=day_yesterday, shift=shift
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
    return attendance, None


def do_clock_out(employee, datetime_override=None):
    """
    Core clock-out logic extracted for reuse (PWA, biometric, API).
    Returns (attendance, error_string). On success error_string is None.
    """
    work_info = employee.employee_work_info
    if work_info is None:
        return None, "Employee has no work information"

    shift = work_info.shift_id
    if datetime_override:
        datetime_now = datetime_override
        date_today = datetime_now.date() if hasattr(datetime_now, "date") else date.today()
        now = datetime_now.strftime("%H:%M")
    else:
        datetime_now = datetime.now()
        date_today = date.today()
        now = datetime_now.strftime("%H:%M")

    day = date_today.strftime("%A").lower()
    day = EmployeeShiftDay.objects.get(day=day)
    attendance = (
        Attendance.objects.filter(employee_id=employee)
        .order_by("id", "attendance_date")
        .last()
    )
    if attendance is not None:
        day = attendance.attendance_day
    minimum_hour, start_time_sec, end_time_sec = shift_schedule_today(
        day=day, shift=shift
    )
    attendance = clock_out_attendance_and_activity(
        employee=employee, date_today=date_today, now=now, out_datetime=datetime_now
    )
    if attendance:
        early_out_instance = attendance.late_come_early_out.filter(type="early_out")
        is_night_shift = attendance.is_night_shift()
        next_date = attendance.attendance_date + timedelta(days=1)
        if not early_out_instance.exists():
            now_sec = strtime_seconds(now)
            mid_sec = strtime_seconds("12:00")
            if is_night_shift:
                if (attendance.attendance_date == date_today) or (
                    mid_sec >= now_sec and date_today == next_date
                ):
                    early_out(
                        attendance=attendance,
                        start_time=start_time_sec,
                        end_time=end_time_sec,
                        shift=shift,
                    )
            elif attendance.attendance_date == date_today:
                early_out(
                    attendance=attendance,
                    start_time=start_time_sec,
                    end_time=end_time_sec,
                    shift=shift,
                )
        return attendance, None
    return None, "No open attendance activity to clock out"


@login_required
@hx_request_required
def clock_in(request):
    """
    This method is used to mark the attendance once per a day and multiple attendance activities.
    """
    # check wether check in/check out feature is enabled
    selected_company = request.session.get("selected_company")
    if selected_company == "all":
        attendance_general_settings = AttendanceGeneralSetting.objects.filter(
            company_id=None
        ).first()
    else:
        company = Company.objects.filter(id=selected_company).first()
        attendance_general_settings = AttendanceGeneralSetting.objects.filter(
            company_id=company
        ).first()
    # request.__dict__.get("datetime")' used to check if the request is from a biometric device
    if (
        attendance_general_settings
        and attendance_general_settings.enable_check_in
        or request.__dict__.get("datetime")
    ):
        allowed_attendance_ips = AttendanceAllowedIP.objects.first()

        if (
            not request.__dict__.get("datetime")
            and allowed_attendance_ips
            and allowed_attendance_ips.is_enabled
        ):

            x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
            ip = request.META.get("REMOTE_ADDR")
            if x_forwarded_for:
                ip = x_forwarded_for.split(",")[0]

            allowed_ips = allowed_attendance_ips.additional_data.get("allowed_ips", [])
            ip_allowed = False
            for allowed_ip in allowed_ips:
                try:
                    if ipaddress.ip_address(ip) in ipaddress.ip_network(
                        allowed_ip, strict=False
                    ):
                        ip_allowed = True
                        break
                except ValueError:
                    continue

            if not ip_allowed:
                return HttpResponse(_("You cannot mark attendance from this network"))

        employee, work_info = employee_exists(request)
        datetime_now = datetime.now()
        if request.__dict__.get("datetime"):
            datetime_now = request.datetime
        if employee and work_info is not None:
            shift = work_info.shift_id
            date_today = date.today()
            if request.__dict__.get("date"):
                date_today = request.date
            attendance_date = date_today
            day = date_today.strftime("%A").lower()
            day = EmployeeShiftDay.objects.get(day=day)
            now = datetime.now().strftime("%H:%M")
            if request.__dict__.get("time"):
                now = request.time.strftime("%H:%M")
            now_sec = strtime_seconds(now)
            mid_day_sec = strtime_seconds("12:00")
            minimum_hour, start_time_sec, end_time_sec = shift_schedule_today(
                day=day, shift=shift
            )
            if start_time_sec > end_time_sec:
                # night shift
                # ------------------
                # Night shift in Horilla consider a 24 hours from noon to next day noon,
                # the shift day taken today if the attendance clocked in after 12 O clock.

                if mid_day_sec > now_sec:
                    # Here you need to create attendance for yesterday

                    date_yesterday = date_today - timedelta(days=1)
                    day_yesterday = date_yesterday.strftime("%A").lower()
                    day_yesterday = EmployeeShiftDay.objects.get(day=day_yesterday)
                    minimum_hour, start_time_sec, end_time_sec = shift_schedule_today(
                        day=day_yesterday, shift=shift
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
            # Gọi headless (M2M máy chấm công): không render template HTML
            if getattr(request, "is_headless", False):
                return HttpResponse("clocked in")
            return render(
                request, "attendance/components/in_out_component.html", {"run": 1}
            )
        return HttpResponse(
            _(
                "You Don't have work information filled or your employee detail neither entered "
            )
        )
    else:
        messages.error(request, _("Check in/Check out feature is not enabled."))
        return HttpResponse("<script>location.reload();</script>")


def clock_out_attendance_and_activity(employee, date_today, now, out_datetime=None):
    """
    Clock out the attendance and activity
    args:
        employee    : employee instance
        date_today  : today date
        now         : now
    """

    attendance_activities = AttendanceActivity.objects.filter(
        employee_id=employee,
    ).order_by("attendance_date", "id")
    attendance_activity = None  # Initialize attendance_activity

    if attendance_activities.filter(clock_out__isnull=True).exists():
        attendance_activity = attendance_activities.filter(
            clock_out__isnull=True
        ).last()
        attendance_activity.clock_out = out_datetime
        attendance_activity.clock_out_date = date_today
        attendance_activity.out_datetime = out_datetime
        attendance_activity.save()

        attendance_activities = attendance_activities.filter(
            attendance_date=attendance_activity.attendance_date
        )
        # Here calculate the total durations between the attendance activities

        duration = 0
        for activity in attendance_activities:
            in_datetime, out_datetime = activity_datetime(activity)
            difference = out_datetime - in_datetime
            days_second = difference.days * 24 * 3600
            seconds = difference.seconds
            total_seconds = days_second + seconds
            duration = duration + total_seconds
        duration = format_time(duration)
        # update clock out of attendance — match the activity's attendance_date
        att_date = attendance_activity.attendance_date
        attendance = Attendance.objects.filter(
            employee_id=employee, attendance_date=att_date
        ).first()
        if attendance is None:
            attendance = Attendance.objects.filter(employee_id=employee).order_by(
                "-attendance_date", "-id"
            ).first()
        if attendance is not None:
            attendance.attendance_clock_out = now + ":00"
            attendance.attendance_clock_out_date = date_today
            attendance.attendance_worked_hour = duration
            attendance.attendance_overtime = overtime_calculation(attendance)
            attendance.attendance_validated = attendance_validate(attendance)
            attendance.save()

        try:
            recompute_day(employee, attendance_activity.attendance_date)
        except Exception:
            logger.exception("recompute_day (clock-out) failed")
        return attendance

    logger.error("No attendance clock in activity found that needs clocking out.")
    return


ALD26_MIN_SECONDS = 9 * 3600 + 35 * 60  # 09:35 = đủ 100% công


def _is_ald26(employee):
    """True nếu nhân viên đang ở ca ALD26 (ca 24h chung toàn công ty)."""
    try:
        wi = getattr(employee, "employee_work_info", None)
        return bool(wi and wi.shift_id and wi.shift_id.employee_shift == "ALD26")
    except Exception:
        return False


def recompute_day(employee, attendance_date):
    """Bộ điều phối: ALD26 dùng thuật toán span (đầu→cuối); còn lại dùng one-way."""
    if _is_ald26(employee):
        return recompute_ald26_day(employee, attendance_date)
    return recompute_combined_day(employee, attendance_date)


def recompute_ald26_day(employee, attendance_date):
    """Tính công 1 ngày cho ca ALD26.

    Gom MỌI lượt chấm trong ngày (clock_in + clock_out của các activity):
    - giờ vào ca = lượt chấm đầu tiên
    - giờ ra ca  = lượt chấm cuối cùng (lượt thứ >2 → giờ ra ca cập nhật theo lượt mới nhất)
    - tổng giờ   = lượt cuối − lượt đầu (span thô, KHÔNG trừ nghỉ trưa)
    Chỉ 1 lượt → giờ ra ca = None (NCO). 0 lượt → không có Attendance (Vắng).
    """
    from datetime import time as _dtime
    from attendance.methods.utils import format_time
    from attendance.models import Attendance, AttendanceActivity

    acts = list(
        AttendanceActivity.objects.filter(
            employee_id=employee, attendance_date=attendance_date
        )
    )

    def _secs(t):
        return t.hour * 3600 + t.minute * 60 + t.second if t else None

    punches = []
    for a in acts:
        for t in (a.clock_in, a.clock_out):
            s = _secs(t)
            if s is not None:
                punches.append(s)
    punches.sort()

    att = Attendance.objects.filter(
        employee_id=employee, attendance_date=attendance_date
    ).first()
    if att is None:
        return {"punches": len(punches), "worked_sec": 0}

    def _to_time(sec):
        sec = int(sec) % 86400
        return _dtime(sec // 3600, (sec % 3600) // 60, sec % 60)

    att.minimum_hour = "09:35"
    if len(punches) >= 2:
        worked = max(0, punches[-1] - punches[0])
        att.attendance_clock_in = _to_time(punches[0])
        att.attendance_clock_out = _to_time(punches[-1])
        att.attendance_clock_out_date = attendance_date
        att.attendance_worked_hour = format_time(worked)
        att.at_work_second = worked
    else:
        # 1 lượt → NCO (có giờ vào, chưa có giờ ra)
        worked = 0
        if punches:
            att.attendance_clock_in = _to_time(punches[0])
        att.attendance_clock_out = None
        att.attendance_clock_out_date = None
        att.attendance_worked_hour = format_time(0)
        att.at_work_second = 0
    att.save()
    return {"punches": len(punches), "worked_sec": worked}


def recompute_combined_day(employee, attendance_date):
    """Recompute a day's worked hours for one-way / combined shifts.

    For shifts whose schedule has check_mode in {clock_in_only, clock_out_only},
    credit each shift's window capped to its start/end (no excess for early-in or
    late-out — OT is handled by the existing OT-approval flow), and the lunch gap
    between shifts is excluded naturally. Returns {"missing": [...], "worked_sec": n}
    or None when the day has no one-way shift (the generic activity-sum stands).
    """
    from datetime import time as _dtime
    from attendance.methods.utils import format_time, strtime_seconds as _sts
    from attendance.models import Attendance, AttendanceActivity, EmployeeShiftPlan
    from base.models import EmployeeShiftDay, EmployeeShiftSchedule

    weekday = attendance_date.strftime("%A").lower()
    try:
        day_obj = EmployeeShiftDay.objects.get(day=weekday)
    except EmployeeShiftDay.DoesNotExist:
        return None

    plan_shift_ids = list(
        EmployeeShiftPlan.objects.filter(employee=employee, date=attendance_date)
        .values_list("shift_id", flat=True)
    )
    if not plan_shift_ids:
        return None
    scheds = list(
        EmployeeShiftSchedule.objects.filter(day=day_obj, shift_id__in=plan_shift_ids)
        .select_related("shift_id")
    )
    if not any(s.check_mode in ("clock_in_only", "clock_out_only") for s in scheds):
        return None

    acts = list(
        AttendanceActivity.objects.filter(
            employee_id=employee, attendance_date=attendance_date
        )
    )

    def _secs(t):
        return t.hour * 3600 + t.minute * 60 + t.second if t else None

    total = 0
    min_total = 0
    missing = []
    day_in = None
    day_out = None
    for s in scheds:
        st = _secs(s.start_time)
        en = _secs(s.end_time)
        if st is None or en is None:
            continue
        window = max(0, en - st)
        min_total += _sts(s.minimum_working_hour or "00:00")
        mode = s.check_mode
        if mode == "clock_in_only":
            ins = sorted(
                _secs(a.clock_in) for a in acts
                if a.clock_in and st - 3600 <= _secs(a.clock_in) <= en
            )
            if not ins:
                missing.append({"shift": s.shift_id.employee_shift, "need": "clock_in"})
                continue
            total += min(window, max(0, en - max(ins[0], st)))
            day_in = ins[0] if day_in is None else min(day_in, ins[0])
            day_out = en if day_out is None else max(day_out, en)
        elif mode == "clock_out_only":
            outs = sorted(
                _secs(a.clock_out) for a in acts
                if a.clock_out and st <= _secs(a.clock_out) <= en + 3600
            )
            if not outs:
                missing.append({"shift": s.shift_id.employee_shift, "need": "clock_out"})
                continue
            total += min(window, max(0, min(outs[-1], en) - st))
            day_in = st if day_in is None else min(day_in, st)
            day_out = outs[-1] if day_out is None else max(day_out, outs[-1])
        else:  # both
            for a in acts:
                ci = _secs(a.clock_in)
                co = _secs(a.clock_out)
                if ci is not None and co is not None and ci >= st - 3600 and co <= en + 3600:
                    total += max(0, min(co, en) - max(ci, st))
                    day_in = ci if day_in is None else min(day_in, ci)
                    day_out = co if day_out is None else max(day_out, co)

    att = Attendance.objects.filter(
        employee_id=employee, attendance_date=attendance_date
    ).first()
    if att is None:
        return {"missing": missing, "worked_sec": total}

    def _to_time(sec):
        sec = int(sec) % 86400
        return _dtime(sec // 3600, (sec % 3600) // 60, sec % 60)

    att.attendance_worked_hour = format_time(total)
    att.minimum_hour = format_time(min_total)
    if day_in is not None:
        att.attendance_clock_in = _to_time(day_in)
    if day_out is not None:
        att.attendance_clock_out = _to_time(day_out)
        att.attendance_clock_out_date = attendance_date
    att.save()
    return {"missing": missing, "worked_sec": total}


def early_out_create(attendance):
    """
    Used to create early out report
    args:
        attendance : attendance obj
    """
    if AttendanceLateComeEarlyOut.objects.filter(
        type="early_out", attendance_id=attendance
    ).exists():
        late_come_obj = AttendanceLateComeEarlyOut.objects.filter(
            type="early_out", attendance_id=attendance
        ).first()
    else:
        late_come_obj = AttendanceLateComeEarlyOut()
    late_come_obj.type = "early_out"
    late_come_obj.attendance_id = attendance
    late_come_obj.employee_id = attendance.employee_id
    late_come_obj.save()
    return late_come_obj


def early_out(attendance, start_time, end_time, shift):
    """
    This method is used to mark the early check-out attendance before the shift ends
    args:
        attendance : attendance obj
        start_time : attendance day shift start time
        start_end : attendance day shift end time
    """
    if not enable_late_come_early_out_tracking(None).get("tracking"):
        return

    clock_out_time = attendance.attendance_clock_out
    if isinstance(clock_out_time, str):
        clock_out_time = datetime.strptime(clock_out_time, "%H:%M:%S")

    now_sec = strtime_seconds(clock_out_time.strftime("%H:%M"))
    mid_day_sec = strtime_seconds("12:00")
    # Checking gracetime allowance before creating early out
    if shift and shift.grace_time_id:
        if (
            shift.grace_time_id.is_active == True
            and shift.grace_time_id.allowed_clock_out == True
        ):
            now_sec += shift.grace_time_id.allowed_time_in_secs
    elif GraceTime.objects.filter(is_default=True, is_active=True).exists():
        grace_time = GraceTime.objects.filter(
            is_default=True,
            is_active=True,
        ).first()
        # Setting allowance for the check out time if grace allocate for clock out event
        if grace_time.allowed_clock_out:
            now_sec += grace_time.allowed_time_in_secs
    else:
        pass
    if start_time > end_time:
        # Early out condition for night shift
        if now_sec < mid_day_sec:
            if now_sec < end_time:
                # Early out condition for general shift
                early_out_create(attendance)
        else:
            early_out_create(attendance)
        return
    if end_time > now_sec:
        early_out_create(attendance)
    return


@login_required
@hx_request_required
def clock_out(request):
    """
    This method is used to set the out date and time for attendance and attendance activity
    """
    # check wether check in/check out feature is enabled
    selected_company = request.session.get("selected_company")
    if selected_company == "all":
        attendance_general_settings = AttendanceGeneralSetting.objects.filter(
            company_id=None
        ).first()
    else:
        company = Company.objects.filter(id=selected_company).first()
        attendance_general_settings = AttendanceGeneralSetting.objects.filter(
            company_id=company
        ).first()
    if (
        attendance_general_settings
        and attendance_general_settings.enable_check_in
        or request.__dict__.get("datetime")
    ):
        datetime_now = datetime.now()
        if request.__dict__.get("datetime"):
            datetime_now = request.datetime
        employee, work_info = employee_exists(request)
        shift = work_info.shift_id
        date_today = date.today()
        if request.__dict__.get("date"):
            date_today = request.date
        day = date_today.strftime("%A").lower()
        day = EmployeeShiftDay.objects.get(day=day)
        attendance = (
            Attendance.objects.filter(employee_id=employee)
            .order_by("id", "attendance_date")
            .last()
        )
        if attendance is not None:
            day = attendance.attendance_day
        now = datetime.now().strftime("%H:%M")
        if request.__dict__.get("time"):
            now = request.time.strftime("%H:%M")
        minimum_hour, start_time_sec, end_time_sec = shift_schedule_today(
            day=day, shift=shift
        )
        attendance = clock_out_attendance_and_activity(
            employee=employee, date_today=date_today, now=now, out_datetime=datetime_now
        )
        if attendance:
            early_out_instance = attendance.late_come_early_out.filter(type="early_out")
            is_night_shift = attendance.is_night_shift()
            next_date = attendance.attendance_date + timedelta(days=1)
            if not early_out_instance.exists():
                if is_night_shift:
                    now_sec = strtime_seconds(now)
                    mid_sec = strtime_seconds("12:00")

                    if (attendance.attendance_date == date_today) or (
                        # check is next day mid
                        mid_sec >= now_sec
                        and date_today == next_date
                    ):
                        early_out(
                            attendance=attendance,
                            start_time=start_time_sec,
                            end_time=end_time_sec,
                            shift=shift,
                        )
                elif attendance.attendance_date == date_today:
                    early_out(
                        attendance=attendance,
                        start_time=start_time_sec,
                        end_time=end_time_sec,
                        shift=shift,
                    )

        # Gọi headless (M2M máy chấm công): không render template HTML
        if getattr(request, "is_headless", False):
            return HttpResponse("clocked out")
        return render(
            request, "attendance/components/in_out_component.html", {"run": 1}
        )

    else:
        messages.error(request, _("Check in/Check out feature is not enabled."))
        return HttpResponse("<script>location.reload();</script>")
