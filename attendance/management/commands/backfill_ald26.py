"""
Backfill dữ liệu chấm công theo thuật toán ALD26 (span: lượt đầu = giờ vào ca,
lượt cuối = giờ ra ca, tổng = đầu→cuối không trừ trưa; 1 lượt → NCO).

Chạy lại recompute_ald26_day cho MỌI ngày có hoạt động chấm công trong khoảng tháng.
Chỉ đụng ngày có ≥1 AttendanceActivity (ngày không có lượt chấm để nguyên).

Usage: python manage.py backfill_ald26 --month 2026-06 [--dry-run]
"""
import calendar
from datetime import date
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = "Backfill chấm công theo dạng ALD26 (span giờ vào/ra) cho 1 tháng"

    def add_arguments(self, parser):
        parser.add_argument("--month", required=True, help="YYYY-MM, vd 2026-06")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        from attendance.models import AttendanceActivity, Attendance
        from employee.models import Employee
        from attendance.views.clock_in_out import recompute_ald26_day

        y, m = map(int, opts["month"].split("-"))
        start = date(y, m, 1)
        end = date(y, m, calendar.monthrange(y, m)[1])
        dry = opts["dry_run"]

        pairs = sorted(set(
            AttendanceActivity.objects.filter(
                attendance_date__range=[start, end]
            ).values_list("employee_id_id", "attendance_date")
        ))
        self.stdout.write(f"Khoảng {start}..{end}: {len(pairs)} (nhân viên, ngày) có chấm công")

        emp_cache = {}
        def get_emp(eid):
            if eid not in emp_cache:
                emp_cache[eid] = Employee.objects.filter(id=eid).first()
            return emp_cache[eid]

        done = 0
        nco = 0
        with transaction.atomic():
            for eid, d in pairs:
                emp = get_emp(eid)
                if not emp:
                    continue
                r = recompute_ald26_day(emp, d)
                done += 1
                if r and r.get("punches") == 1:
                    nco += 1
            if dry:
                self.stdout.write(f"[DRY-RUN] sẽ recompute {done} ngày ({nco} ngày 1-lượt→NCO)")
                transaction.set_rollback(True)
            else:
                self.stdout.write(self.style.SUCCESS(
                    f"Đã recompute {done} ngày ({nco} ngày 1-lượt→NCO)"
                ))
