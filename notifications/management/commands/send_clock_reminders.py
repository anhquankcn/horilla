"""Nhắc chấm công — command độc lập chạy bằng cron mỗi phút.

    python manage.py send_clock_reminders

Idempotent theo (profile, mốc giờ, ngày) nên an toàn chạy lặp lại."""
from django.core.management.base import BaseCommand

from notifications.clock_reminders import run_clock_reminders


class Command(BaseCommand):
    help = "Gửi nhắc chấm công (web push) theo mốc giờ NV đã đặt."

    def handle(self, *args, **options):
        run_clock_reminders()
        self.stdout.write("clock reminders tick done")
