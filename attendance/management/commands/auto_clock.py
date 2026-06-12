"""
Auto clock-in/out cron job.

Runs every minute. For each shift schedule with auto_punch_in/out enabled,
checks if current time matches the configured time (or shift start/end time).
Creates AttendanceActivity for employees who have a ShiftPlan for today
with that shift AND haven't clocked in/out yet.

Usage:
    python manage.py auto_clock          # run once
    python manage.py auto_clock --loop   # run every 60s (for Docker)
"""
import logging
import time as _time
from datetime import date, datetime, time, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone as django_tz

from attendance.models import Attendance, AttendanceActivity, EmployeeShiftPlan
from attendance.views.clock_in_out import clock_in_attendance_and_activity
from base.models import EmployeeShift, EmployeeShiftDay, EmployeeShiftSchedule
from employee.models import Employee

logger = logging.getLogger(__name__)


def _time_match(now_t, target_t, tolerance_minutes=2):
    """Check if now is within tolerance of target time."""
    if not target_t:
        return False
    now_mins = now_t.hour * 60 + now_t.minute
    target_mins = target_t.hour * 60 + target_t.minute
    return abs(now_mins - target_mins) <= tolerance_minutes


def run_auto_clock():
    """Main auto clock logic — called every minute."""
    local_now = django_tz.localtime(django_tz.now())
    today = local_now.date()
    now_time = local_now.time()
    day_name = today.strftime("%A").lower()

    try:
        day_obj = EmployeeShiftDay.objects.get(day=day_name)
    except EmployeeShiftDay.DoesNotExist:
        return

    # Find schedules with auto punch enabled for today's weekday
    schedules = EmployeeShiftSchedule.objects.filter(
        day=day_obj,
    ).select_related("shift_id")

    for sched in schedules:
        shift = sched.shift_id

        # Auto clock-in
        if sched.is_auto_punch_in_enabled:
            target = sched.auto_punch_in_time or sched.start_time
            if _time_match(now_time, target):
                _do_auto_clock_in(shift, sched, today, local_now, day_obj, now_time)

        # Auto clock-out
        if sched.is_auto_punch_out_enabled:
            target = sched.auto_punch_out_time or sched.end_time
            if _time_match(now_time, target):
                _do_auto_clock_out(shift, sched, today, now_time)


def _do_auto_clock_in(shift, sched, today, local_now, day_obj, now_time):
    """Auto clock-in for all employees with this shift plan today."""
    plans = EmployeeShiftPlan.objects.filter(
        shift=shift, date=today
    ).select_related("employee")

    for plan in plans:
        emp = plan.employee
        if not emp.is_active:
            continue

        # Skip if already clocked in today
        existing = AttendanceActivity.objects.filter(
            employee_id=emp, attendance_date=today
        ).exists()
        if existing:
            continue

        try:
            now_str = now_time.strftime("%H:%M")
            from attendance.methods.utils import strtime_seconds, shift_schedule_today
            minimum_hour, start_time_sec, end_time_sec = shift_schedule_today(
                day=day_obj, shift=shift
            )
            clock_in_attendance_and_activity(
                employee=emp,
                date_today=today,
                attendance_date=today,
                day=day_obj,
                now=now_str,
                shift=shift,
                minimum_hour=minimum_hour,
                start_time=start_time_sec,
                end_time=end_time_sec,
                in_datetime=local_now,
            )
            logger.info("Auto clock-in: %s shift=%s", emp, shift.employee_shift)
        except Exception:
            logger.exception("Auto clock-in failed: %s shift=%s", emp, shift.employee_shift)


def _do_auto_clock_out(shift, sched, today, now_time):
    """Auto clock-out for employees with open activities for this shift today."""
    plans = EmployeeShiftPlan.objects.filter(
        shift=shift, date=today
    ).select_related("employee")

    close_time = sched.auto_punch_out_time or sched.end_time
    if not close_time:
        return

    for plan in plans:
        emp = plan.employee
        if not emp.is_active:
            continue

        open_acts = AttendanceActivity.objects.filter(
            employee_id=emp,
            attendance_date=today,
            clock_out__isnull=True,
        )
        for act in open_acts:
            try:
                close_dt = datetime.combine(today, close_time)
                AttendanceActivity.objects.filter(pk=act.pk).update(
                    clock_out=close_time,
                    clock_out_date=today,
                    out_datetime=django_tz.make_aware(close_dt),
                )

                # Update attendance record
                att = Attendance.objects.filter(
                    employee_id=emp, attendance_date=today,
                    attendance_clock_out__isnull=True,
                ).first()
                if att:
                    clock_in_dt = datetime.combine(today, att.attendance_clock_in)
                    clock_out_dt = datetime.combine(today, close_time)
                    diff = clock_out_dt - clock_in_dt
                    total_sec = max(0, int(diff.total_seconds()))
                    h, m, s = total_sec // 3600, (total_sec % 3600) // 60, total_sec % 60
                    worked = f"{h:02d}:{m:02d}:{s:02d}"
                    Attendance.objects.filter(pk=att.pk).update(
                        attendance_clock_out=close_time,
                        attendance_worked_hour=worked,
                        attendance_validated=True,
                    )

                logger.info("Auto clock-out: %s shift=%s at %s", emp, shift.employee_shift, close_time)
            except Exception:
                logger.exception("Auto clock-out failed: %s", emp)


class Command(BaseCommand):
    help = "Auto clock-in/out based on shift schedule configuration"

    def add_arguments(self, parser):
        parser.add_argument("--loop", action="store_true", help="Run continuously every 60s")

    def handle(self, *args, **options):
        if options["loop"]:
            self.stdout.write("Auto-clock loop started (every 60s)")
            while True:
                try:
                    run_auto_clock()
                except Exception:
                    logger.exception("auto_clock loop error")
                _time.sleep(60)
        else:
            run_auto_clock()
            self.stdout.write("Auto-clock run complete")
