"""
Dọn dẹp Ca làm việc: giữ lại HCH26 và CSH26, chuyển toàn bộ bản ghi
chấm công và thông tin nhân viên sang ca HCH26.

Dry-run (mặc định):
    python manage.py cleanup_shifts

Thực thi thật:
    python manage.py cleanup_shifts --execute
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Giữ lại ca HCH26 + CSH26, chuyển tất cả attendance cũ về HCH26"

    KEEP_NAMES = ["HCH26", "CSH26"]
    MIGRATE_TO = "HCH26"

    def add_arguments(self, parser):
        parser.add_argument(
            "--execute",
            action="store_true",
            help="Thực thi thật. Không có flag này chỉ dry-run.",
        )

    def handle(self, *args, **options):
        from attendance.models import Attendance, AttendanceOverTime, EmployeeShiftPlan
        from base.models import EmployeeShift, EmployeeShiftSchedule, ShiftRequest
        from employee.models import EmployeeWorkInfo

        execute = options["execute"]
        dry = not execute

        if dry:
            self.stdout.write(self.style.WARNING("=== DRY-RUN (không thay đổi DB) ===\n"))

        # 1. Tìm các ca cần giữ
        keep_shifts = {}
        for name in self.KEEP_NAMES:
            qs = EmployeeShift.objects.filter(employee_shift=name)
            if not qs.exists():
                raise CommandError(f"Không tìm thấy ca '{name}' trong DB. Kiểm tra lại tên chính xác.")
            if qs.count() > 1:
                self.stdout.write(
                    self.style.WARNING(f"Có {qs.count()} ca tên '{name}', dùng id={qs.first().pk}")
                )
            keep_shifts[name] = qs.first()

        hch26 = keep_shifts[self.MIGRATE_TO]
        keep_pks = {s.pk for s in keep_shifts.values()}

        # 2. Tìm các ca cần xóa
        old_shifts = EmployeeShift.objects.exclude(pk__in=keep_pks)
        old_count = old_shifts.count()
        old_names = list(old_shifts.values_list("employee_shift", flat=True))

        self.stdout.write(f"Ca giữ lại  : {', '.join(self.KEEP_NAMES)} (id={', '.join(str(s.pk) for s in keep_shifts.values())})")
        self.stdout.write(f"Ca sẽ xóa   : {old_count} ca — {old_names}\n")

        if old_count == 0:
            self.stdout.write(self.style.SUCCESS("Không có ca nào cần dọn dẹp."))
            return

        # 3. Thống kê ảnh hưởng
        att_count      = Attendance.objects.filter(shift_id__in=old_shifts).count()
        ot_count       = AttendanceOverTime.objects.filter(shift_id__in=old_shifts).count()
        workinfo_count = EmployeeWorkInfo.objects.filter(shift_id__in=old_shifts).count()
        plan_count     = EmployeeShiftPlan.objects.filter(shift__in=old_shifts).count()
        req_count      = ShiftRequest.objects.filter(shift_id__in=old_shifts).count()
        req_prev_count = ShiftRequest.objects.filter(previous_shift_id__in=old_shifts).count()
        sched_count    = EmployeeShiftSchedule.objects.filter(shift_id__in=old_shifts).count()

        self.stdout.write("Bản ghi sẽ bị ảnh hưởng:")
        self.stdout.write(f"  Attendance (chấm công)          : {att_count} → gắn vào {self.MIGRATE_TO}")
        self.stdout.write(f"  AttendanceOverTime (OT)         : {ot_count} → gắn vào {self.MIGRATE_TO}")
        self.stdout.write(f"  EmployeeWorkInfo (ca mặc định)  : {workinfo_count} → gắn vào {self.MIGRATE_TO}")
        self.stdout.write(f"  EmployeeShiftPlan (kế hoạch ca) : {plan_count} → gắn vào {self.MIGRATE_TO}")
        self.stdout.write(f"  ShiftRequest.shift_id           : {req_count} → gắn vào {self.MIGRATE_TO}")
        self.stdout.write(f"  ShiftRequest.previous_shift_id  : {req_prev_count} → gắn vào {self.MIGRATE_TO}")
        self.stdout.write(f"  EmployeeShiftSchedule (config)  : {sched_count} → sẽ XÓA (config của ca cũ)")
        self.stdout.write(f"  EmployeeShift cũ                : {old_count} → sẽ XÓA\n")

        if dry:
            self.stdout.write(self.style.WARNING(
                "Dry-run xong. Chạy với --execute để thực thi thật.\n"
                "Ví dụ: python manage.py cleanup_shifts --execute"
            ))
            return

        # 4. Thực thi trong 1 transaction
        self.stdout.write("Đang thực thi...")
        with transaction.atomic():
            # Re-assign attendance
            Attendance.objects.filter(shift_id__in=old_shifts).update(shift_id=hch26)
            self.stdout.write(f"  ✓ {att_count} Attendance → {self.MIGRATE_TO}")

            AttendanceOverTime.objects.filter(shift_id__in=old_shifts).update(shift_id=hch26)
            self.stdout.write(f"  ✓ {ot_count} AttendanceOverTime → {self.MIGRATE_TO}")

            EmployeeWorkInfo.objects.filter(shift_id__in=old_shifts).update(shift_id=hch26)
            self.stdout.write(f"  ✓ {workinfo_count} EmployeeWorkInfo → {self.MIGRATE_TO}")

            EmployeeShiftPlan.objects.filter(shift__in=old_shifts).update(shift=hch26)
            self.stdout.write(f"  ✓ {plan_count} EmployeeShiftPlan → {self.MIGRATE_TO}")

            ShiftRequest.objects.filter(shift_id__in=old_shifts).update(shift_id=hch26)
            ShiftRequest.objects.filter(previous_shift_id__in=old_shifts).update(previous_shift_id=hch26)
            self.stdout.write(f"  ✓ {req_count + req_prev_count} ShiftRequest → {self.MIGRATE_TO}")

            # Xóa EmployeeShiftSchedule (config) trước để tránh PROTECT error
            EmployeeShiftSchedule.objects.filter(shift_id__in=old_shifts).delete()
            self.stdout.write(f"  ✓ {sched_count} EmployeeShiftSchedule đã xóa")

            # Xóa EmployeeShift cũ
            deleted, _ = old_shifts.delete()
            self.stdout.write(f"  ✓ {deleted} EmployeeShift cũ đã xóa")

        self.stdout.write(self.style.SUCCESS(
            f"\nHoàn thành. Hệ thống chỉ còn ca: {', '.join(self.KEEP_NAMES)}"
        ))
