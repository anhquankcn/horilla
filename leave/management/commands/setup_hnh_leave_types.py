"""Tạo các loại nghỉ Nhóm 2 (KHÔNG trừ phép) cho HNH — idempotent.

Nhóm 2 = đơn ghi nhận đúng thủ tục, KHÔNG trừ phép năm (không cấp AvailableLeave):
  - Chế độ Hiếu/Hỷ/Phúc lợi
  - Nghỉ không lương
("Công tác" thường đã có sẵn.) Clone field từ 1 loại sẵn có để đủ cấu hình
(reset/carryforward...), chỉ đổi name + payment; KHÔNG tạo AvailableLeave.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Tạo loại nghỉ Nhóm 2 (không trừ phép) cho HNH"

    NHOM2 = [
        ("Chế độ Hiếu/Hỷ/Phúc lợi", "paid_leave"),
        ("Nghỉ không lương", "unpaid_leave"),
    ]

    def handle(self, *args, **options):
        from leave.models import LeaveType
        from horilla.horilla_middlewares import _thread_locals

        # LeaveType.save() đọc request.session từ thread-local → đặt request giả
        # (session rỗng) để chạy được trong management command (không có HTTP request).
        class _FakeReq:
            session = {}
        _thread_locals.request = _FakeReq()

        template = (
            LeaveType.objects.filter(name="Công tác").first()
            or LeaveType.objects.filter(name__icontains="phép năm").first()
            or LeaveType.objects.first()
        )
        for name, payment in self.NHOM2:
            if LeaveType.objects.filter(name=name).exists():
                self.stdout.write(f"= đã có: {name}")
                continue
            if template:
                lt = LeaveType.objects.get(pk=template.pk)
                lt.pk = None
                lt.id = None
                lt.name = name
                lt.payment = payment
                lt.total_days = 0.0
                lt.save()
            else:
                LeaveType.objects.create(name=name, payment=payment, total_days=0.0)
            self.stdout.write(f"+ tạo: {name} ({payment})")
        self.stdout.write("done setup_hnh_leave_types")
