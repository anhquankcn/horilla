"""Ghi 1 dòng StandbySyncLog từ payload JSON (host script gọi sau khi sync)."""
import json

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Record a StandbySyncLog row from a JSON payload"

    def add_arguments(self, parser):
        parser.add_argument("--payload", required=True, help="JSON: {status, trigger, duration_seconds, tables, reconciliation, message}")

    def handle(self, *args, **options):
        from base.models import StandbySyncLog

        try:
            p = json.loads(options["payload"])
        except Exception as e:
            self.stderr.write(f"Bad payload: {e}")
            return
        log = StandbySyncLog.objects.create(
            finished_at=timezone.now(),
            duration_seconds=p.get("duration_seconds"),
            trigger=p.get("trigger", "scheduled"),
            status=p.get("status", "success"),
            tables=p.get("tables", {}),
            reconciliation=p.get("reconciliation", {}),
            message=p.get("message", ""),
        )
        self.stdout.write(f"StandbySyncLog#{log.id} recorded ({log.status})")
