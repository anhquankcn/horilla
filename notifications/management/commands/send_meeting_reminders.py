"""Nhắc họp trước ~15 phút — command độc lập để chạy bằng cron mỗi phút.

    python manage.py send_meeting_reminders

Idempotent theo cửa sổ thời gian nên an toàn chạy lặp lại (cron mỗi phút)."""
from django.core.management.base import BaseCommand

from notifications.meeting_reminders import run_meeting_reminders


class Command(BaseCommand):
    help = "Gửi nhắc lịch họp trước 15 phút (web push) cho NV đã bật."

    def handle(self, *args, **options):
        run_meeting_reminders()
        self.stdout.write("meeting reminders tick done")
