"""
setup_bhxh.py

Seed default BHXH/BHYT/BHTN configuration with Vietnamese rates effective July 2024.

Usage:
  python manage.py setup_bhxh
  python manage.py setup_bhxh --force   # overwrite if already exists
"""

import datetime

from django.core.management.base import BaseCommand

from payroll.models.bhxh_models import BHXHConfig


class Command(BaseCommand):
    help = "Seed BHXH/BHYT/BHTN configuration with Vietnamese rates (effective July 2024)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite existing active config if found.",
        )

    def handle(self, *args, **options):
        force = options["force"]
        effective_from = datetime.date(2024, 7, 1)

        existing = BHXHConfig.objects.filter(effective_from=effective_from).first()
        if existing and not force:
            self.stdout.write(
                self.style.WARNING(
                    f"BHXH config for {effective_from} already exists. Use --force to overwrite."
                )
            )
            return

        if existing and force:
            cfg = existing
        else:
            cfg = BHXHConfig()

        cfg.effective_from = effective_from
        cfg.is_active = True

        # NLĐ rates (Nghị định 58/2020/NĐ-CP + cập nhật 2024)
        cfg.bhxh_rate_ee = "8.00"    # Hưu trí, tử tuất, ốm đau, thai sản
        cfg.bhyt_rate_ee = "1.50"    # Bảo hiểm y tế
        cfg.bhtn_rate_ee = "1.00"    # Bảo hiểm thất nghiệp

        # NSDLĐ rates
        cfg.bhxh_rate_er = "17.50"   # Hưu trí 14% + TNLĐ 0.5% + ốm đau thai sản 3%
        cfg.bhyt_rate_er = "3.00"    # Bảo hiểm y tế
        cfg.bhtn_rate_er = "1.00"    # Bảo hiểm thất nghiệp
        cfg.kpcd_rate_er = "2.00"    # Kinh phí công đoàn

        # Caps (Nghị định 73/2024/NĐ-CP — lương cơ sở 2,340,000đ từ 01/07/2024)
        cfg.luong_co_so = 2_340_000            # → cap BHXH/BHYT = 46,800,000đ
        cfg.luong_toi_thieu_vung = 4_960_000   # Vùng 1 → cap BHTN = 99,200,000đ

        cfg.note = (
            "Tỷ lệ theo Nghị định 58/2020/NĐ-CP (BHXH), 146/2018/NĐ-CP (BHYT), "
            "28/2015/NĐ-CP (BHTN). Lương cơ sở 2,340,000đ theo Nghị định 73/2024/NĐ-CP "
            "hiệu lực 01/07/2024. Vùng 1 TP.HCM/HN: 4,960,000đ/tháng."
        )

        cfg.save()

        self.stdout.write(self.style.SUCCESS(
            f"OK: BHXH config created/updated, effective {effective_from}\n"
            f"  Employee: BHXH {cfg.bhxh_rate_ee}% + BHYT {cfg.bhyt_rate_ee}% + BHTN {cfg.bhtn_rate_ee}% = {cfg.total_ee_rate}%\n"
            f"  Employer: BHXH {cfg.bhxh_rate_er}% + BHYT {cfg.bhyt_rate_er}% + BHTN {cfg.bhtn_rate_er}% + KPCD {cfg.kpcd_rate_er}% = {cfg.total_er_rate}%\n"
            f"  Cap BHXH/BHYT: {cfg.cap_bhxh_bhyt:,} VND/month\n"
            f"  Cap BHTN: {cfg.cap_bhtn:,} VND/month"
        ))
