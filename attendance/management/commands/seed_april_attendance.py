"""
Seed realistic attendance & leave data for April 2026.

Scenarios simulated:
  - Normal attendance (Mon–Fri, 8h–17h) with ±15 min clock-in noise
  - Late arrivals (8:30–10:00) for ~12% of employee-days
  - Early departures (15:00–16:30) for ~6% of employee-days
  - Absent without permission: 8 employees, 1–2 random days
  - Sick leave (Nghỉ ốm): 18 employees, 1–3 days
  - Annual leave (Nghỉ phép năm): 20 employees, 1–2 days
  - Business trip (Công tác): 8 employees, 2–5 consecutive days
  - Weekend workers: tour guides & drivers follow their shift on Sat/Sun
"""

import random
from datetime import date, datetime, time, timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from attendance.models import Attendance
from base.models import EmployeeShift, WorkType
from employee.models import Employee, EmployeeWorkInformation
from leave.models import AvailableLeave, LeaveRequest, LeaveType


YEAR = 2026
MONTH = 4

APRIL_WORKING_DAYS = [
    d for d in (date(YEAR, MONTH, i) for i in range(1, 31))
    if d.weekday() < 5  # Mon–Fri
]

WEEKEND_DAYS = [
    d for d in (date(YEAR, MONTH, i) for i in range(1, 31))
    if d.weekday() >= 5
]

ALL_APRIL = [date(YEAR, MONTH, i) for i in range(1, 31)]

HOLIDAYS = {date(2026, 4, 30)}  # Ngày giải phóng

WEEKEND_SHIFTS = {
    "Ca hướng dẫn viên sáng (6h–15h)",
    "Ca hướng dẫn viên chiều (13h–22h)",
    "Ca lái xe sáng (5h–14h)",
    "Ca lái xe chiều (13h–22h)",
    "Ca cuối tuần (8h–17h, T7–CN)",
    "Ca Tour dài ngày (linh hoạt)",
}

SHIFT_SCHEDULE = {
    "Ca hành chính (8h–17h)":           (time(8, 0),  time(17, 0),  "00:30:00"),
    "Lịch hành chính":                   (time(8, 0),  time(17, 0),  "00:30:00"),
    "Ca hướng dẫn viên sáng (6h–15h)":  (time(6, 0),  time(15, 0),  "00:30:00"),
    "Ca hướng dẫn viên chiều (13h–22h)":(time(13, 0), time(22, 0),  "00:30:00"),
    "Ca lái xe sáng (5h–14h)":          (time(5, 0),  time(14, 0),  "00:30:00"),
    "Ca lái xe chiều (13h–22h)":        (time(13, 0), time(22, 0),  "00:30:00"),
    "Ca cuối tuần (8h–17h, T7–CN)":     (time(8, 0),  time(17, 0),  "00:30:00"),
    "Ca Tour dài ngày (linh hoạt)":     (time(7, 0),  time(18, 0),  "01:00:00"),
}

DEFAULT_SHIFT = (time(8, 0), time(17, 0), "00:30:00")


def rnd_minutes(base_time, delta_minutes):
    """Add random minutes (±) to a time object."""
    dt = datetime.combine(date.today(), base_time)
    dt += timedelta(minutes=delta_minutes)
    return dt.time()


def fmt_time(t):
    return t.strftime("%H:%M")


def worked_hours(clock_in, clock_out):
    dt_in  = datetime.combine(date.today(), clock_in)
    dt_out = datetime.combine(date.today(), clock_out)
    diff   = dt_out - dt_in
    h, rem = divmod(int(diff.total_seconds()), 3600)
    m      = rem // 60
    return f"{h:02d}:{m:02d}"


def overtime_hours(worked, minimum):
    fmt = lambda s: sum(int(x) * m for x, m in zip(s.split(":"), [60, 1]))
    diff = fmt(worked) - fmt(minimum)
    if diff <= 0:
        return "00:00"
    return f"{diff // 60:02d}:{diff % 60:02d}"


class Command(BaseCommand):
    help = "Seed realistic April 2026 attendance & leave data"

    def add_arguments(self, parser):
        parser.add_argument("--clear", action="store_true",
                            help="Delete existing April 2026 attendance/leave before seeding")

    def handle(self, *args, **options):
        rng = random.Random(42)  # fixed seed for reproducibility

        if options["clear"]:
            deleted_att = Attendance.objects.filter(
                attendance_date__year=YEAR, attendance_date__month=MONTH
            ).delete()
            deleted_lr = LeaveRequest.objects.filter(
                start_date__year=YEAR, start_date__month=MONTH
            ).delete()
            self.stdout.write(f"Cleared: {deleted_att[0]} attendance, {deleted_lr[0]} leave requests")

        employees = list(
            Employee.objects.filter(is_active=True)
            .select_related("employee_work_info__shift_id", "employee_work_info__work_type_id")
        )
        self.stdout.write(f"Found {len(employees)} active employees")

        # ── 1. Create leave types if missing ──────────────────────────────
        leave_types = self._ensure_leave_types()

        # ── 2. Ensure AvailableLeave for all employees ─────────────────────
        self._ensure_available_leave(employees, leave_types)

        # ── 3. Assign leave scenarios ──────────────────────────────────────
        sick_type     = leave_types["sick"]
        annual_type   = leave_types["annual"]
        business_type = leave_types["business"]
        absent_type   = leave_types["absent"]

        # who is on leave which days
        leave_days_by_emp = {}  # emp.id -> set of dates

        # Sick leave: 18 random employees, 1–3 days
        sick_pool = rng.sample(employees, 18)
        for emp in sick_pool:
            n = rng.randint(1, 3)
            start_idx = rng.randint(0, len(APRIL_WORKING_DAYS) - n)
            days = APRIL_WORKING_DAYS[start_idx:start_idx + n]
            self._create_leave(emp, sick_type, days[0], days[-1], "approved", leave_days_by_emp)

        # Annual leave: 20 employees (different from sick pool), 1–2 days
        remaining = [e for e in employees if e not in sick_pool]
        annual_pool = rng.sample(remaining, min(20, len(remaining)))
        for emp in annual_pool:
            n = rng.randint(1, 2)
            start_idx = rng.randint(0, len(APRIL_WORKING_DAYS) - n)
            days = APRIL_WORKING_DAYS[start_idx:start_idx + n]
            self._create_leave(emp, annual_type, days[0], days[-1], "approved", leave_days_by_emp)

        # Business trip: 8 employees, 2–5 consecutive days
        biz_pool = rng.sample([e for e in employees if e not in sick_pool + annual_pool], min(8, 50))
        for emp in biz_pool:
            n = rng.randint(2, 5)
            start_idx = rng.randint(0, len(APRIL_WORKING_DAYS) - n)
            days = APRIL_WORKING_DAYS[start_idx:start_idx + n]
            self._create_leave(emp, business_type, days[0], days[-1], "approved", leave_days_by_emp)

        # Absent without permission: 8 employees, 1–2 days, status=requested (pending)
        absent_pool = rng.sample(employees, 8)
        for emp in absent_pool:
            n = rng.randint(1, 2)
            start_idx = rng.randint(0, len(APRIL_WORKING_DAYS) - n)
            days = APRIL_WORKING_DAYS[start_idx:start_idx + n]
            self._create_leave(emp, absent_type, days[0], days[-1], "requested", leave_days_by_emp)

        # ── 4. Build attendance records ────────────────────────────────────
        # Mark ~12% emp-days as late, ~6% as early departure
        att_objects = []
        late_emps    = set(rng.sample([e.id for e in employees], int(len(employees) * 0.35)))
        early_emps   = set(rng.sample([e.id for e in employees], int(len(employees) * 0.20)))

        for emp in employees:
            wi        = getattr(emp, "employee_work_info", None)
            shift_obj = wi.shift_id if wi else None
            wtype_obj = wi.work_type_id if wi else None
            shift_name = shift_obj.employee_shift if shift_obj else "Ca hành chính (8h–17h)"
            sched      = SHIFT_SCHEDULE.get(shift_name, DEFAULT_SHIFT)
            std_in, std_out, min_hour = sched

            is_weekend_worker = shift_name in WEEKEND_SHIFTS
            work_days = (APRIL_WORKING_DAYS + WEEKEND_DAYS) if is_weekend_worker else APRIL_WORKING_DAYS

            emp_leave_days = leave_days_by_emp.get(emp.id, set())

            for day in work_days:
                if day in HOLIDAYS:
                    continue
                if day in emp_leave_days:
                    continue

                # Late arrival probability: 12% for flagged employees
                is_late   = emp.id in late_emps and rng.random() < 0.12
                is_early  = emp.id in early_emps and rng.random() < 0.06

                if is_late:
                    late_mins = rng.randint(15, 90)
                    clock_in  = rnd_minutes(std_in, late_mins)
                else:
                    noise_in  = rng.randint(-5, 15)
                    clock_in  = rnd_minutes(std_in, noise_in)

                if is_early:
                    early_mins = rng.randint(30, 120)
                    clock_out  = rnd_minutes(std_out, -early_mins)
                else:
                    noise_out  = rng.randint(0, 60)
                    clock_out  = rnd_minutes(std_out, noise_out)

                # Ensure clock_out > clock_in by at least 4 hours
                dt_in  = datetime.combine(day, clock_in)
                dt_out = datetime.combine(day, clock_out)
                if (dt_out - dt_in).total_seconds() < 4 * 3600:
                    dt_out = dt_in + timedelta(hours=8)
                    clock_out = dt_out.time()

                worked   = worked_hours(clock_in, clock_out)
                overtime = overtime_hours(worked, min_hour)

                att_objects.append(Attendance(
                    employee_id       = emp,
                    attendance_date   = day,
                    shift_id          = shift_obj,
                    work_type_id      = wtype_obj,
                    attendance_day    = day.strftime("%A").lower(),
                    attendance_clock_in_date  = day,
                    attendance_clock_in       = fmt_time(clock_in),
                    attendance_clock_out_date = day,
                    attendance_clock_out      = fmt_time(clock_out),
                    attendance_worked_hour    = worked,
                    minimum_hour              = min_hour,
                    attendance_overtime       = overtime,
                    attendance_validated      = True,
                ))

        with transaction.atomic():
            Attendance.objects.bulk_create(att_objects, batch_size=500, ignore_conflicts=True)

        self.stdout.write(self.style.SUCCESS(
            f"\nDone! Created {len(att_objects)} attendance records + leave requests for April 2026"
        ))

    # ─── helpers ────────────────────────────────────────────────────────────

    def _ensure_leave_types(self):
        from horilla.horilla_middlewares import _thread_locals
        # Mock request so LeaveType.save() doesn't crash on session access
        class _FakeSession(dict):
            def get(self, key, default=None):
                return default
        class _FakeRequest:
            session = _FakeSession()
            user = None
        _thread_locals.request = _FakeRequest()

        defaults = [
            ("Nghỉ phép năm", "#198754", "paid_leave",  12),
            ("Nghỉ ốm",       "#fd7e14", "unpaid_leave", 10),
            ("Công tác",      "#0d6efd", "paid_leave",  30),
            ("Vắng không phép","#dc3545","unpaid_leave", 0),
        ]
        result = {}
        keys   = ["annual", "sick", "business", "absent"]
        for (name, color, payment, count), key in zip(defaults, keys):
            lt, created = LeaveType.objects.get_or_create(
                name=name,
                defaults={
                    "color": color,
                    "payment": payment,
                    "count": count,
                    "period_in": "days",
                    "require_approval": True,
                    "exclude_company_leave": True,
                    "exclude_holiday": True,
                },
            )
            result[key] = lt
            self.stdout.write(f"  Leave type: {lt.name} (id={lt.id}){' [created]' if created else ''}")

        _thread_locals.request = None
        return result

    def _ensure_available_leave(self, employees, leave_types):
        annual_type = leave_types["annual"]
        sick_type   = leave_types["sick"]
        bulk = []
        for emp in employees:
            for lt, days in [(annual_type, 12), (sick_type, 10)]:
                if not AvailableLeave.objects.filter(employee_id=emp, leave_type_id=lt).exists():
                    bulk.append(AvailableLeave(
                        employee_id=emp,
                        leave_type_id=lt,
                        available_days=days,
                        carryforward_days=0,
                    ))
        if bulk:
            AvailableLeave.objects.bulk_create(bulk, batch_size=500, ignore_conflicts=True)
            self.stdout.write(f"  Created {len(bulk)} AvailableLeave entries")

    def _create_leave(self, emp, leave_type, start, end, status, leave_days_by_emp):
        # Skip if overlapping with existing leave for this employee
        existing = leave_days_by_emp.get(emp.id, set())
        days = {start + timedelta(d) for d in range((end - start).days + 1)}
        if days & existing:
            return
        try:
            requested_days = sum(1 for d in days if d.weekday() < 5)
            LeaveRequest.objects.get_or_create(
                employee_id=emp,
                leave_type_id=leave_type,
                start_date=start,
                defaults={
                    "end_date": end,
                    "start_date_breakdown": "full_day",
                    "end_date_breakdown": "full_day",
                    "requested_days": requested_days,
                    "status": status,
                    "description": f"Tháng 4/2026 — {leave_type.name}",
                },
            )
            leave_days_by_emp.setdefault(emp.id, set()).update(days)
        except Exception as e:
            self.stdout.write(f"  [warn] leave skip {emp}: {e}")
