"""
management/commands/setup_pit.py

Seed PITConfig records for Vietnam:
  - Pre-2026 config (NQ 954/2020): 11,000,000 GTBT, 4,400,000 GTNPT — inactive
  - 2026 config (NQ 110/2025): 15,500,000 GTBT, 6,200,000 GTNPT — active
"""

from django.core.management.base import BaseCommand

from payroll.models.pit_models import PITConfig


class Command(BaseCommand):
    help = "Seed PITConfig with Vietnam 2026 deduction rates"

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Overwrite existing configs")

    def handle(self, *args, **options):
        force = options["force"]

        configs = [
            {
                "effective_from": "2020-07-06",
                "personal_deduction": 11_000_000,
                "npt_deduction": 4_400_000,
                "is_active": False,
                "note": "NQ 954/2020/UBTVQH14: GTBT 11,000,000d, NPT 4,400,000d. Ap dung den 31/12/2025.",
            },
            {
                "effective_from": "2026-01-01",
                "personal_deduction": 15_500_000,
                "npt_deduction": 6_200_000,
                "is_active": True,
                "note": "NQ 110/2025/UBTVQH15 + Luat Thue TNCN 2025: GTBT 15,500,000d, NPT 6,200,000d. Hieu luc tu 01/01/2026.",
            },
        ]

        for cfg_data in configs:
            eff_from = cfg_data["effective_from"]
            exists = PITConfig.objects.filter(effective_from=eff_from, company_id__isnull=True).exists()

            if exists and not force:
                self.stdout.write(f"  [SKIP] PITConfig effective {eff_from} already exists (use --force to overwrite)")
                continue

            if exists and force:
                PITConfig.objects.filter(effective_from=eff_from, company_id__isnull=True).delete()

            PITConfig.objects.create(
                effective_from=cfg_data["effective_from"],
                personal_deduction=cfg_data["personal_deduction"],
                npt_deduction=cfg_data["npt_deduction"],
                is_active=cfg_data["is_active"],
                note=cfg_data["note"],
            )
            status = "ACTIVE" if cfg_data["is_active"] else "inactive"
            self.stdout.write(f"  [OK] PITConfig {eff_from} ({status}) - GTBT={cfg_data['personal_deduction']:,}, NPT={cfg_data['npt_deduction']:,}")

        self.stdout.write("setup_pit done.")
