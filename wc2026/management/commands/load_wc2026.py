"""
Seed WC2026 matches from fixtures/matches.json
Usage: python manage.py load_wc2026 [--clear]
"""
import json
import os
from datetime import datetime, timezone
from django.core.management.base import BaseCommand
from wc2026.models import WCMatch, ROUND_POINTS


class Command(BaseCommand):
    help = "Seed WC2026 matches from JSON fixture"

    def add_arguments(self, parser):
        parser.add_argument("--clear", action="store_true", help="Delete all matches first")

    def handle(self, *args, **options):
        if options["clear"]:
            deleted, _ = WCMatch.objects.all().delete()
            self.stdout.write(f"Deleted {deleted} matches")

        fixture_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "fixtures", "matches.json"
        )

        if not os.path.exists(fixture_path):
            self.stderr.write(f"Fixture not found: {fixture_path}")
            return

        with open(fixture_path, "r", encoding="utf-8") as f:
            matches_data = json.load(f)

        created = 0
        for m in matches_data:
            match_time = datetime.fromisoformat(m["t"].replace("Z", "+00:00"))
            round_name = m.get("r", "group")
            points = ROUND_POINTS.get(round_name, 1000)

            _, is_new = WCMatch.objects.update_or_create(
                match_number=m["n"],
                defaults={
                    "team_a": m["a"],
                    "team_b": m["b"],
                    "team_a_code": m["ac"],
                    "team_b_code": m["bc"],
                    "round": round_name,
                    "group_name": m.get("g", ""),
                    "match_time": match_time,
                    "points_pool": points,
                },
            )
            if is_new:
                created += 1

        total = WCMatch.objects.count()
        self.stdout.write(self.style.SUCCESS(f"Created {created} new, {total} total matches"))
