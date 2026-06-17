"""
Thiết lập ca ALD26 (1 ca chung 24h cho toàn công ty) và gán cho tất cả nhân viên.

ALD26: bắt đầu 00:00, kết thúc 23:58, tối thiểu 09:35 = 100% công, check_mode "both"
(cần chấm vào + ra), KHÔNG auto-punch (nhân viên tự chấm). Thay thế các ca cũ
(HCS26/HCC26…) — giữ ca cũ trong DB nhưng không gán nữa.

Usage: python manage.py setup_ald26 [--dry-run]
"""
from datetime import time
from django.core.management.base import BaseCommand
from django.db import transaction

ALD26_NAME = "ALD26"
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


class Command(BaseCommand):
    help = "Tạo ca ALD26 (24h, min 09:35) và gán cho toàn bộ nhân viên"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        from base.models import EmployeeShift, EmployeeShiftSchedule, EmployeeShiftDay
        from employee.models import EmployeeWorkInformation

        dry = opts["dry_run"]

        with transaction.atomic():
            # _base_manager khắp nơi: HorillaCompanyManager thêm DISTINCT, mà
            # update_or_create dùng select_for_update → "FOR UPDATE not allowed with DISTINCT".
            shift, created = EmployeeShift._base_manager.get_or_create(
                employee_shift=ALD26_NAME,
                defaults={"weekly_full_time": "168:00", "full_time": "744:00"},
            )
            self.stdout.write(f"Shift ALD26: {'tạo mới' if created else 'đã có'} (id={shift.id})")

            sched_n = 0
            for day_name in DAYS:
                day_obj, _ = EmployeeShiftDay._base_manager.get_or_create(day=day_name)
                _, sc = EmployeeShiftSchedule._base_manager.update_or_create(
                    shift_id=shift, day=day_obj,
                    defaults={
                        "start_time": time(0, 0, 0),
                        "end_time": time(23, 58, 0),
                        "minimum_working_hour": "09:35",
                        "check_mode": "both",
                        "is_auto_punch_in_enabled": False,
                        "is_auto_punch_out_enabled": False,
                        "is_night_shift": False,
                        "work_day_coefficient": 1.00,
                    },
                )
                sched_n += 1
            self.stdout.write(f"Lịch ca 7 ngày: {sched_n} bản ghi")

            # _base_manager: bỏ qua HorillaCompanyManager (thêm DISTINCT → vỡ .update())
            mgr = EmployeeWorkInformation._base_manager
            ids = list(mgr.exclude(shift_id=shift).values_list("id", flat=True))
            count = len(ids)
            if dry:
                self.stdout.write(f"[DRY-RUN] sẽ gán ALD26 cho {count} nhân viên")
                transaction.set_rollback(True)
            else:
                mgr.filter(id__in=ids).update(shift_id=shift)
                self.stdout.write(self.style.SUCCESS(f"Đã gán ALD26 cho {count} nhân viên"))

        total = EmployeeWorkInformation._base_manager.filter(
            shift_id__employee_shift=ALD26_NAME
        ).count()
        self.stdout.write(self.style.SUCCESS(f"Tổng NV đang ở ca ALD26: {total}"))
