"""
Simulate attendance records 02/05/2026 – 26/05/2026.
Run: docker exec horilla-web-1 python sim_attendance_may.py
"""
import os, random, django
from datetime import date, time, timedelta

os.environ["DJANGO_SETTINGS_MODULE"] = "horilla.settings"
django.setup()

from attendance.models import Attendance
from base.models import EmployeeShiftDay
from employee.models import Employee, EmployeeWorkInformation

# ── Config ────────────────────────────────────────────────────────────────────
HOLIDAYS = {date(2026, 4, 30), date(2026, 5, 1)}

VN_DAYS = {0:"Thứ hai",1:"Thứ ba",2:"Thứ tư",3:"Thứ năm",4:"Thứ sáu",5:"Thứ bảy",6:"Chủ nhật"}

# Pre-load EmployeeShiftDay FK objects (weekday() 0=Mon … 6=Sun → ShiftDay instance)
_shift_days = {d.day: d for d in EmployeeShiftDay.objects.all()}
WEEKDAY_TO_SHIFTDAY = {
    0: _shift_days.get("monday"),
    1: _shift_days.get("tuesday"),
    2: _shift_days.get("wednesday"),
    3: _shift_days.get("thursday"),
    4: _shift_days.get("friday"),
    5: _shift_days.get("saturday"),
    6: _shift_days.get("sunday"),
}

def working_days(start: date, end: date):
    d = start
    while d <= end:
        if d.weekday() < 5 and d not in HOLIDAYS:
            yield d
        d += timedelta(days=1)

def fmt_hm(td: timedelta) -> str:
    total = int(td.total_seconds())
    h, m = divmod(total // 60, 60)
    return f"{h:02d}:{m:02d}"

def rand_time(base_h, base_m, spread_min):
    delta = random.randint(-spread_min // 2, spread_min)
    total = base_h * 60 + base_m + delta
    total = max(0, min(1439, total))
    return time(total // 60, total % 60)

# ── Gather employees and their shifts ────────────────────────────────────────
wi_map = {}   # emp_id -> (shift_id, work_type_id)
for wi in EmployeeWorkInformation.objects.select_related("employee_id", "shift_id").all():
    emp = wi.employee_id
    if emp and emp.is_active:
        wi_map[emp.pk] = (wi.shift_id, wi.work_type_id)

employees = list(Employee.objects.filter(is_active=True).only("id"))
print(f"Active employees: {len(employees)}")

# ── Existing records index (date, emp_id) ────────────────────────────────────
existing = set(
    Attendance.objects
    .filter(attendance_date__gte=date(2026, 4, 30))
    .values_list("attendance_date", "employee_id_id")
)
print(f"Existing records from Apr 30 onwards: {len(existing)}")

# ── Simulate ─────────────────────────────────────────────────────────────────
to_create = []
days = list(working_days(date(2026, 5, 2), date(2026, 5, 26)))
print(f"Working days to simulate: {len(days)}")

ABSENCE_RATE = 0.04   # 4% vắng mỗi ngày
LATE_RATE    = 0.10   # 10% đi trễ
EARLY_RATE   = 0.06   # 6% về sớm

for day in days:
    day_name = VN_DAYS[day.weekday()]
    daily_count = 0
    for emp in employees:
        if (day, emp.pk) in existing:
            continue
        if random.random() < ABSENCE_RATE:
            continue  # vắng

        shift, work_type = wi_map.get(emp.pk, (None, None))
        shift_id = shift.pk if shift else None

        # Determine shift pattern from shift name
        shift_name = shift.employee_shift.lower() if shift and shift.employee_shift else ""
        if "lái xe sáng" in shift_name or "hướng dẫn sáng" in shift_name:
            ci_h, ci_m, co_h, co_m = 5, 30, 14, 0
        elif "lái xe chiều" in shift_name or "hướng dẫn chiều" in shift_name:
            ci_h, ci_m, co_h, co_m = 13, 0, 21, 30
        elif "cuối tuần" in shift_name:
            ci_h, ci_m, co_h, co_m = 8, 0, 17, 0
        elif "tour" in shift_name:
            ci_h, ci_m, co_h, co_m = 6, 0, 20, 0
        else:  # Ca hành chính
            ci_h, ci_m, co_h, co_m = 8, 0, 17, 0

        # Clock in
        if random.random() < LATE_RATE:
            clock_in = rand_time(ci_h, ci_m + 15, 30)  # trễ 15-45 phút
        else:
            clock_in = rand_time(ci_h, ci_m, 20)  # đúng giờ ±20 phút

        # Clock out
        if random.random() < EARLY_RATE:
            clock_out = rand_time(co_h, co_m - 30, 20)  # về sớm 30 phút
        else:
            clock_out = rand_time(co_h, co_m, 30)  # ±30 phút sau giờ

        # Worked hours
        ci_min = clock_in.hour * 60 + clock_in.minute
        co_min = clock_out.hour * 60 + clock_out.minute
        if co_min <= ci_min:
            co_min = ci_min + 480  # tối thiểu 8h nếu lệch
        worked_min = co_min - ci_min
        worked = timedelta(minutes=worked_min)

        standard_min = (co_h - ci_h) * 60
        ot_min = max(0, worked_min - standard_min)
        ot = timedelta(minutes=ot_min)

        min_hour = "08:00" if standard_min >= 480 else fmt_hm(timedelta(minutes=standard_min))

        to_create.append(Attendance(
            employee_id=emp,
            attendance_date=day,
            attendance_clock_in_date=day,
            attendance_clock_in=clock_in,
            attendance_clock_out_date=day,
            attendance_clock_out=time(co_min // 60 % 24, co_min % 60),
            attendance_worked_hour=fmt_hm(worked),
            attendance_overtime=fmt_hm(ot),
            minimum_hour=min_hour,
            attendance_validated=True,
            attendance_day=WEEKDAY_TO_SHIFTDAY[day.weekday()],
            shift_id_id=shift_id,
            work_type_id_id=work_type.pk if work_type else None,
            is_holiday=False,
        ))
        daily_count += 1

    print(f"  {day.strftime('%a %d/%m')}: {daily_count} records queued")

# ── Bulk insert in batches of 500 ─────────────────────────────────────────────
BATCH = 500
total = len(to_create)
print(f"\nInserting {total} records...")
for i in range(0, total, BATCH):
    Attendance.objects.bulk_create(to_create[i:i+BATCH], ignore_conflicts=True)
    print(f"  ...{min(i+BATCH, total)}/{total}")

print(f"\nDone — {total} attendance records created.")
