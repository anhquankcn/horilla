"""
setup_hnh_deductions_kpi.py

Tự động tạo dữ liệu mẫu để chạy thử tính lương:

1. Khoản khấu trừ chuẩn VN 2026 (BHXH/BHYT/BHTN phần NLĐ)
2. Phụ lục 1 năm 2026 cho toàn bộ TrialContract
3. Gắn khoản trừ vào từng TrialContract

Chạy:
    python manage.py setup_hnh_deductions_kpi
    python manage.py setup_hnh_deductions_kpi --force   # tạo lại Phụ lục 1 đã có
    python manage.py setup_hnh_deductions_kpi --dry-run
"""

import logging
from datetime import date

from django.core.management.base import BaseCommand

from payroll.models.contract_models import ContractKPIAppendix, TrialContract
from payroll.models.models import Deduction
from payroll.utils.salary_data import get_annual_salary

logger = logging.getLogger(__name__)

# ─── Khoản khấu trừ theo Luật BHXH VN 2026 ──────────────────────────────────
# Tỷ lệ đóng của Người Lao Động (NLĐ):
#   BHXH: 8%   Người Sử Dụng Lao Động (NSDLĐ): 17.5%
#   BHYT: 1.5% NSDLĐ: 3%
#   BHTN: 1%   NSDLĐ: 1%
# Trần lương đóng BHXH/BHYT: 36 lần lương cơ sở (36 × 2.34M ≈ 84.24M/tháng — 2026)
# Trần lương đóng BHTN: 20 lần lương tối thiểu vùng I (≈ 99.2M/tháng — không cap thực tế)
# Tất cả là pretax (giảm trừ thu nhập chịu thuế TNCN theo Điều 21 TT số 111/2013/TT-BTC)

BHXH_CAP = 84_240_000   # 36 × 2,340,000 (lương cơ sở 2026)
BHYT_CAP = 84_240_000
BHTN_CAP = 99_200_000   # 20 × 4,960,000 (tối thiểu vùng I 2026 ước tính)

DEDUCTION_DEFS = [
    {
        "title": "BHXH — Người lao động (8%)",
        "is_fixed": False,
        "based_on": "basic_pay",
        "rate": 8.0,
        "employer_rate": 17.5,
        "is_pretax": True,
        "is_tax": False,
        "has_max_limit": True,
        "maximum_amount": round(BHXH_CAP * 0.08),   # ~6,739,200 đ/tháng
        "if_choice": "basic_pay",
        "if_condition": "gt",
        "if_amount": 0,
    },
    {
        "title": "BHYT — Người lao động (1.5%)",
        "is_fixed": False,
        "based_on": "basic_pay",
        "rate": 1.5,
        "employer_rate": 3.0,
        "is_pretax": True,
        "is_tax": False,
        "has_max_limit": True,
        "maximum_amount": round(BHYT_CAP * 0.015),  # ~1,263,600 đ/tháng
        "if_choice": "basic_pay",
        "if_condition": "gt",
        "if_amount": 0,
    },
    {
        "title": "BHTN — Người lao động (1%)",
        "is_fixed": False,
        "based_on": "basic_pay",
        "rate": 1.0,
        "employer_rate": 1.0,
        "is_pretax": True,
        "is_tax": False,
        "has_max_limit": True,
        "maximum_amount": round(BHTN_CAP * 0.01),   # ~992,000 đ/tháng
        "if_choice": "basic_pay",
        "if_condition": "gt",
        "if_amount": 0,
    },
]

KPI_YEAR = 2026

# Mô tả KPI mẫu cho từng cấp bậc (dựa trên level từ tên vị trí)
KPI_DESC_TEMPLATES = {
    "director": "KPI cấp Giám đốc: Doanh thu phòng/bộ phận đạt kế hoạch, hiệu quả vận hành, phát triển đội ngũ.",
    "manager":  "KPI cấp Trưởng/Phó phòng: Hoàn thành chỉ tiêu phòng ban, chất lượng dịch vụ, giữ chân nhân sự.",
    "leader":   "KPI cấp Team Leader: Năng suất nhóm, tỷ lệ hoàn thành kế hoạch, hài lòng khách hàng nội bộ.",
    "expert":   "KPI chuyên viên: Số lượng hồ sơ/task hoàn thành, chất lượng công việc, đúng deadline.",
    "default":  "KPI nhân viên: Hoàn thành nhiệm vụ được giao, tuân thủ quy trình, chất lượng sản phẩm/dịch vụ.",
}


def _kpi_desc(pos_name: str) -> str:
    n = (pos_name or "").lower()
    if any(k in n for k in ["giam doc", "director", "tong", "chu tich"]):
        return KPI_DESC_TEMPLATES["director"]
    if any(k in n for k in ["truong phong", "truong ban", "pho phong", "truong bo phan", "ke toan truong"]):
        return KPI_DESC_TEMPLATES["manager"]
    if any(k in n for k in ["team leader", "truong nhom", "team laeder"]):
        return KPI_DESC_TEMPLATES["leader"]
    if any(k in n for k in ["chuyen vien", "ke toan vien", "lap trinh", "quan tri"]):
        return KPI_DESC_TEMPLATES["expert"]
    return KPI_DESC_TEMPLATES["default"]


class Command(BaseCommand):
    help = "Tạo khoản khấu trừ BHXH/BHYT/BHTN và Phụ lục 1 mẫu để chạy thử tính lương"

    def add_arguments(self, parser):
        parser.add_argument("--force",   action="store_true", help="Tạo lại Phụ lục 1 đã có")
        parser.add_argument("--dry-run", action="store_true", help="Xem trước, không lưu")

    def handle(self, *args, **options):
        force   = options["force"]
        dry_run = options["dry_run"]
        if dry_run:
            self.stdout.write("[DRY-RUN] Không lưu vào DB.\n")

        # ── 1. Tạo/cập nhật khoản khấu trừ ──────────────────────────────────
        self.stdout.write("\n=== Bước 1: Khoản khấu trừ ===")
        deductions = []
        for d in DEDUCTION_DEFS:
            title = d["title"]
            if dry_run:
                self.stdout.write(f"  [DRY] Deduction: {title}")
                deductions.append(None)
                continue
            existing = Deduction.objects.filter(title=title).first()
            if existing:
                # update() bypasses save() — tránh lỗi request.session trong management command
                Deduction.objects.filter(pk=existing.pk).update(
                    rate=d["rate"],
                    employer_rate=d["employer_rate"],
                    maximum_amount=d["maximum_amount"],
                    is_active=True,
                )
                obj = Deduction.objects.get(pk=existing.pk)
                created = False
            else:
                # bulk_create() bypasses save() cũng vậy
                result = Deduction.objects.bulk_create([Deduction(
                    title=title,
                    is_fixed=d["is_fixed"],
                    based_on=d["based_on"],
                    rate=d["rate"],
                    employer_rate=d["employer_rate"],
                    is_pretax=d["is_pretax"],
                    is_tax=d["is_tax"],
                    has_max_limit=d["has_max_limit"],
                    maximum_amount=d["maximum_amount"],
                    if_choice=d["if_choice"],
                    if_condition=d["if_condition"],
                    if_amount=d["if_amount"],
                    is_active=True,
                    include_active_employees=False,
                )])
                obj = Deduction.objects.get(title=title)
                created = True
            tag = "[TẠO MỚI]" if created else "[CẬP NHẬT]"
            self.stdout.write(
                f"  {tag} {title} — NLĐ {d['rate']}% | NSDLĐ {d['employer_rate']}% "
                f"| tối đa {d['maximum_amount']:,.0f}đ/tháng"
            )
            deductions.append(obj)

        if not dry_run and not all(deductions):
            self.stdout.write("[LỖI] Không tạo được khoản trừ, dừng lại.")
            return

        # ── 2. Phụ lục 1 + gắn khoản trừ vào từng TrialContract ─────────────
        self.stdout.write(f"\n=== Bước 2: Phụ lục 1 năm {KPI_YEAR} + Khoản trừ ===")

        contracts = (
            TrialContract.objects
            .select_related(
                "employee_id",
                "employee_id__employee_work_info__job_position_id",
            )
            .filter(contract_status="active")
            .order_by("employee_id__employee_last_name")
        )
        self.stdout.write(f"Tìm thấy {contracts.count()} TrialContracts đang hiệu lực.\n")

        kpi_created = kpi_skipped = kpi_updated = linked = errors = 0

        for c in contracts:
            wi       = getattr(c.employee_id, "employee_work_info", None)
            pos_obj  = wi.job_position_id if wi else None
            pos_name = pos_obj.job_position if pos_obj else ""
            emp_name = c.employee_id.get_full_name()

            annual_min, annual_max, monthly_advance = get_annual_salary(pos_name)

            # ── Phụ lục 1 ──────────────────────────────────────────────────
            existing_kpi = ContractKPIAppendix.objects.filter(
                trial_contract=c, year=KPI_YEAR
            ).first()

            if existing_kpi and not force:
                kpi_skipped += 1
            else:
                if dry_run:
                    self.stdout.write(
                        f"  [DRY KPI] {emp_name} | {pos_name or 'Nhân viên'} | "
                        f"min={annual_min:,.0f} max={annual_max:,.0f} adv={monthly_advance:,.0f}"
                    )
                    kpi_created += 1
                else:
                    try:
                        if existing_kpi and force:
                            existing_kpi.position    = pos_obj
                            existing_kpi.annual_income_min = annual_min
                            existing_kpi.annual_income_max = annual_max
                            existing_kpi.monthly_performance_advance = monthly_advance
                            existing_kpi.kpi_description = _kpi_desc(pos_name)
                            existing_kpi.save()
                            kpi_updated += 1
                        else:
                            ContractKPIAppendix.objects.create(
                                trial_contract=c,
                                year=KPI_YEAR,
                                position=pos_obj,
                                annual_income_min=annual_min,
                                annual_income_max=annual_max,
                                monthly_performance_advance=monthly_advance,
                                kpi_description=_kpi_desc(pos_name),
                                kpi_pct_90_100=100.0,
                                kpi_pct_75_89=75.0,
                                kpi_pct_60_74=50.0,
                                kpi_below_60=0.0,
                            )
                            kpi_created += 1
                    except Exception as e:
                        self.stdout.write(f"  [LỖI KPI] {emp_name}: {e}")
                        errors += 1

            # ── Gắn khoản trừ ──────────────────────────────────────────────
            if not dry_run:
                for d_obj in deductions:
                    c.deductions.add(d_obj)
                linked += 1

        # ── Báo cáo kết quả ──────────────────────────────────────────────────
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write("KẾT QUẢ:")
        self.stdout.write(f"  Khoản trừ   : {len(DEDUCTION_DEFS)} (BHXH + BHYT + BHTN)")
        self.stdout.write(f"  Phụ lục 1   : Tạo mới={kpi_created} | Cập nhật={kpi_updated} | Bỏ qua={kpi_skipped}")
        self.stdout.write(f"  Gắn khoản trừ vào hợp đồng: {linked}")
        self.stdout.write(f"  Lỗi         : {errors}")
        self.stdout.write("=" * 60)

        self.stdout.write("\nTóm tắt khoản trừ đã tạo:")
        self.stdout.write(f"  BHXH NLĐ 8%  + NSDLĐ 17.5% → trần {BHXH_CAP * 0.08 / 1_000_000:.2f}M đ/tháng")
        self.stdout.write(f"  BHYT NLĐ 1.5%+ NSDLĐ 3%    → trần {BHYT_CAP * 0.015 / 1_000_000:.2f}M đ/tháng")
        self.stdout.write(f"  BHTN NLĐ 1%  + NSDLĐ 1%    → trần {BHTN_CAP * 0.01 / 1_000_000:.2f}M đ/tháng")
        self.stdout.write(f"  Tổng NLĐ đóng: 10.5% lương cơ bản")
        self.stdout.write(f"  Tổng NSDLĐ : 21.5% lương cơ bản")
        self.stdout.write("\nSẵn sàng chạy thử tính lương!")
