"""
Seed WC2026 group stage matches.
Usage: python manage.py load_wc2026
"""
from datetime import datetime, timezone, timedelta
from django.core.management.base import BaseCommand
from wc2026.models import WCMatch, ROUND_POINTS

UTC7 = timezone(timedelta(hours=7))

# 48 group stage matches — WC2026 (12 groups × 4 teams × 3 matchdays)
# Source: FIFA official draw Dec 2025
GROUPS = {
    "A": ["Mexico", "MX", "Colombia", "CO", "Ecuador", "EC", "Bolivia", "BO"],
    "B": ["Canada", "CA", "Morocco", "MA", "Australia", "AU", "IR Iran", "IR"],
    "C": ["Argentina", "AR", "Peru", "PE", "Chile", "CL", "Trinidad", "TT"],
    "D": ["USA", "US", "England", "GB", "Wales", "GB", "Panama", "PA"],
    "E": ["Brazil", "BR", "Cameroon", "CM", "New Zealand", "NZ", "Costa Rica", "CR"],
    "F": ["France", "FR", "Saudi Arabia", "SA", "Denmark", "DK", "China", "CN"],
    "G": ["Spain", "ES", "Egypt", "EG", "Paraguay", "PY", "Uzbekistan", "UZ"],
    "H": ["Germany", "DE", "Japan", "JP", "South Korea", "KR", "Bahrain", "BH"],
    "I": ["Portugal", "PT", "Uruguay", "UY", "Ghana", "GH", "Israel", "IL"],
    "J": ["Netherlands", "NL", "Senegal", "SN", "Jamaica", "JM", "Qatar", "QA"],
    "K": ["Italy", "IT", "Nigeria", "NG", "Tunisia", "TN", "Honduras", "HN"],
    "L": ["Belgium", "BE", "Croatia", "HR", "Serbia", "RS", "El Salvador", "SV"],
}

# Matchday schedule pattern (days offset from tournament start)
# MD1: day 0-3, MD2: day 4-7, MD3: day 8-11
KICKOFF_TIMES = [
    (0, "00:00"),   # 07:00 VN
    (0, "03:00"),   # 10:00 VN
    (0, "12:00"),   # 19:00 VN
    (0, "15:00"),   # 22:00 VN
]


class Command(BaseCommand):
    help = "Seed WC2026 group stage matches"

    def add_arguments(self, parser):
        parser.add_argument("--clear", action="store_true", help="Delete all matches first")

    def handle(self, *args, **options):
        if options["clear"]:
            deleted, _ = WCMatch.objects.all().delete()
            self.stdout.write(f"Deleted {deleted} matches")

        if WCMatch.objects.exists():
            self.stdout.write("Matches already exist. Use --clear to reset.")
            return

        tournament_start = datetime(2026, 6, 11, 0, 0, tzinfo=timezone.utc)
        match_num = 0
        matches_created = []

        groups_list = list(GROUPS.items())

        # Matchday 1: team1 vs team2, team3 vs team4
        for day_offset, group_idx in enumerate(range(0, 12, 4)):
            for gi in range(min(4, 12 - group_idx)):
                g_letter, teams = groups_list[group_idx + gi]
                t1, c1, t2, c2, t3, c3, t4, c4 = teams

                # Game 1: team1 vs team2
                match_num += 1
                kick = tournament_start + timedelta(days=day_offset, hours=12 + gi * 3)
                matches_created.append(WCMatch(
                    match_number=match_num, team_a=t1, team_b=t2,
                    team_a_code=c1, team_b_code=c2,
                    round="group", group_name=g_letter,
                    match_time=kick, points_pool=ROUND_POINTS["group"],
                ))

                # Game 2: team3 vs team4
                match_num += 1
                kick2 = kick + timedelta(hours=1, minutes=30)
                matches_created.append(WCMatch(
                    match_number=match_num, team_a=t3, team_b=t4,
                    team_a_code=c3, team_b_code=c4,
                    round="group", group_name=g_letter,
                    match_time=kick2, points_pool=ROUND_POINTS["group"],
                ))

        # Matchday 2: team1 vs team3, team2 vs team4
        for day_offset, group_idx in enumerate(range(0, 12, 4)):
            for gi in range(min(4, 12 - group_idx)):
                g_letter, teams = groups_list[group_idx + gi]
                t1, c1, t2, c2, t3, c3, t4, c4 = teams

                match_num += 1
                kick = tournament_start + timedelta(days=4 + day_offset, hours=12 + gi * 3)
                matches_created.append(WCMatch(
                    match_number=match_num, team_a=t1, team_b=t3,
                    team_a_code=c1, team_b_code=c3,
                    round="group", group_name=g_letter,
                    match_time=kick, points_pool=ROUND_POINTS["group"],
                ))

                match_num += 1
                kick2 = kick + timedelta(hours=1, minutes=30)
                matches_created.append(WCMatch(
                    match_number=match_num, team_a=t2, team_b=t4,
                    team_a_code=c2, team_b_code=c4,
                    round="group", group_name=g_letter,
                    match_time=kick2, points_pool=ROUND_POINTS["group"],
                ))

        # Matchday 3: team1 vs team4, team2 vs team3
        for day_offset, group_idx in enumerate(range(0, 12, 4)):
            for gi in range(min(4, 12 - group_idx)):
                g_letter, teams = groups_list[group_idx + gi]
                t1, c1, t2, c2, t3, c3, t4, c4 = teams

                match_num += 1
                kick = tournament_start + timedelta(days=8 + day_offset, hours=12 + gi * 3)
                matches_created.append(WCMatch(
                    match_number=match_num, team_a=t1, team_b=t4,
                    team_a_code=c1, team_b_code=c4,
                    round="group", group_name=g_letter,
                    match_time=kick, points_pool=ROUND_POINTS["group"],
                ))

                match_num += 1
                kick2 = kick + timedelta(hours=1, minutes=30)
                matches_created.append(WCMatch(
                    match_number=match_num, team_a=t2, team_b=t3,
                    team_a_code=c2, team_b_code=c3,
                    round="group", group_name=g_letter,
                    match_time=kick2, points_pool=ROUND_POINTS["group"],
                ))

        WCMatch.objects.bulk_create(matches_created)
        self.stdout.write(self.style.SUCCESS(f"Created {len(matches_created)} group stage matches"))
