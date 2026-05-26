"""
Management command khởi tạo cấu hình payroll cho Công ty Du lịch Hồng Ngọc Hà.

Cấu trúc lương HNH:
  Thực lĩnh =
    + Lương hợp đồng                     (Contract.wage = basic_pay)
    + Lương hiệu suất công việc           (Allowance — taxable, per employee)
    + Thưởng KPI tháng                   (Allowance — taxable, one-time per month)
    +/- Thưởng hiệu suất đầu quý         (Allowance/Deduction — one-time per quarter)
    - Phạt KPI tháng                     (Deduction — pre-tax, one-time per month)
    - Tạm ứng thưởng hiệu suất           (Deduction — post-tax, one-time)
    - Tạm ứng lương trong tháng          (Deduction — post-tax, one-time)
    + Các loại phụ cấp                   (Allowances — một số non-taxable)
    + Thưởng kinh doanh (đầu H1/H2)      (Allowance — taxable, one-time 2 lần/năm)
    - Thuế TNCN                          (FilingStatus Python code — lũy tiến 7 bậc)
    - BHXH NLĐ 8%                       (Deduction — pre-tax, rate on basic_pay)
    - BHYT NLĐ 1.5%                     (Deduction — pre-tax, rate on basic_pay)
    - BHTN NLĐ 1%                       (Deduction — pre-tax, rate on basic_pay)
    - Quỹ Công Đoàn 1%                  (Deduction — pre-tax, rate on gross_pay)

Chạy: python manage.py setup_hnh_payroll
      python manage.py setup_hnh_payroll --force   (ghi đè nếu đã tồn tại)
"""

from django.core.management.base import BaseCommand

from base.models import Company
from horilla import horilla_middlewares
from payroll.models.models import Allowance, Deduction, FilingStatus


class _MockSession:
    def get(self, key, default=None):
        return default


class _MockUser:
    is_authenticated = False
    is_anonymous = True


class _MockRequest:
    """Stub request so Allowance/Deduction.save() + HorillaModel.save() don't crash."""
    session = _MockSession()
    user = _MockUser()


def _goc(model_class, lookup, defaults, force=False):
    """get_or_create compatible with models whose save() has no *args/**kwargs."""
    obj = model_class.objects.filter(**lookup).first()
    if obj is None:
        obj = model_class(**{**lookup, **defaults})
        obj.save()
        return obj, True
    if force:
        for k, v in defaults.items():
            setattr(obj, k, v)
        obj.save()
    return obj, False


# ─── Hằng số bảo hiểm xã hội 2024 ─────────────────────────────────────────────
# Mức lương cơ sở dùng làm trần đóng BHXH/BHYT (từ 1/7/2024): 2,340,000 VND
# Trần đóng BHXH/BHYT = 20 × 2,340,000 = 46,800,000 VND
# Mức lương tối thiểu vùng 1 (HCM/HN từ 7/2023): 4,680,000 VND → trần BHTN = 20 × 4,680,000
BHXH_RATE = 8.0          # % NLĐ đóng BHXH
BHYT_RATE = 1.5           # % NLĐ đóng BHYT
BHTN_RATE = 1.0           # % NLĐ đóng BHTN
UNION_RATE = 1.0          # % Quỹ Công Đoàn (tính trên gross)
BHXH_BHYT_CEILING = 46_800_000.0   # VND — trần cơ sở đóng BHXH/BHYT
BHTN_CEILING = 93_600_000.0        # VND — 20 × mức lương tối thiểu vùng 1
BHXH_MAX = BHXH_BHYT_CEILING * BHXH_RATE / 100    # 3,744,000
BHYT_MAX = BHXH_BHYT_CEILING * BHYT_RATE / 100    # 702,000
BHTN_MAX = BHTN_CEILING * BHTN_RATE / 100         # 936,000

# ─── Giảm trừ bản thân TNCN ────────────────────────────────────────────────────
PERSONAL_DEDUCTION = 11_000_000.0  # 11 triệu/tháng

# ─── Python code tính thuế TNCN lũy tiến 7 bậc ────────────────────────────────
# Hàm này nhận yearly_income (thu nhập tính thuế cả năm, đã trừ BHXH, union, giảm trừ gia cảnh)
TNCN_PYTHON_CODE = """
def calculate_federal_tax(yearly_income):
    \"\"\"
    Tính thuế TNCN theo biểu lũy tiến 7 bậc — Luật Thuế TNCN Việt Nam.
    yearly_income: Thu nhập tính thuế cả năm (đã trừ BH NLĐ, giảm trừ bản thân, giảm trừ NPT).
    Trả về: Thuế TNCN cả năm (VND).

    Brackets (năm):       Bậc (tháng):
      0 –  60,000,000  →   0 – 5,000,000   :  5%
     60 – 120,000,000  →   5 – 10,000,000  : 10%
    120 – 216,000,000  →  10 – 18,000,000  : 15%
    216 – 384,000,000  →  18 – 32,000,000  : 20%
    384 – 624,000,000  →  32 – 52,000,000  : 25%
    624 – 960,000,000  →  52 – 80,000,000  : 30%
    > 960,000,000      →  > 80,000,000     : 35%
    \"\"\"
    if yearly_income <= 0:
        return 0

    brackets = [
        (60_000_000,  0.05),
        (60_000_000,  0.10),
        (96_000_000,  0.15),
        (168_000_000, 0.20),
        (240_000_000, 0.25),
        (336_000_000, 0.30),
        (None,        0.35),
    ]

    tax = 0.0
    remaining = float(yearly_income)
    for size, rate in brackets:
        if remaining <= 0:
            break
        bracket_income = remaining if size is None else min(remaining, float(size))
        tax += bracket_income * rate
        remaining -= bracket_income

    return round(tax, 2)
"""

# ─── Phụ cấp tiêu chuẩn (tất cả nhân viên active) ────────────────────────────
#  (title, is_taxable, amount, note)
STANDARD_ALLOWANCES = [
    (
        "Phụ cấp ăn",
        False,
        730_000.0,
        "Không chịu thuế đến 730,000 VND/tháng — Thông tư 96/2015/TT-BTC",
    ),
]

# ─── Phụ cấp mẫu (per employee — HR tự chỉ định) ──────────────────────────────
#  (title, is_taxable, note)
PER_EMPLOYEE_ALLOWANCE_TEMPLATES = [
    ("Lương hiệu suất công việc",   True,  "Khoản lương biến đổi theo hiệu suất — HR nhập số tiền cụ thể cho từng NV"),
    ("Thưởng KPI tháng",            True,  "Thưởng KPI đạt chỉ tiêu tháng — tạo one_time_date trong tháng đó"),
    ("Thưởng hiệu suất đầu quý",    True,  "+/- Hiệu suất quý — dùng Allowance nếu dương, Deduction nếu âm"),
    ("Thưởng kinh doanh đầu H1/H2", True,  "Thưởng doanh thu — tạo one_time_date tháng 1 (H2 năm trước) hoặc tháng 7 (H1)"),
    ("Phụ cấp xăng xe / di chuyển", False, "Không chịu thuế cho phần phục vụ công việc thực tế — HR xác nhận mức"),
    ("Phụ cấp điện thoại",          False, "Không chịu thuế cho phần phục vụ công việc — HR xác nhận mức"),
    ("Phụ cấp nhà ở",               True,  "Chịu thuế TNCN đầy đủ — nhập theo hợp đồng NV"),
    ("Phụ cấp trách nhiệm",         True,  "Chịu thuế — dành cho cấp quản lý"),
]

# ─── Deduction mẫu (per employee) ────────────────────────────────────────────
PER_EMPLOYEE_DEDUCTION_TEMPLATES = [
    ("Phạt KPI tháng",              True,  False, "Phạt KPI không đạt — pre-tax, one_time_date trong tháng"),
    ("Tạm ứng thưởng hiệu suất",    False, False, "Trừ tạm ứng hiệu suất đã nhận — post-tax, one_time_date"),
    ("Tạm ứng lương trong tháng",   False, False, "Trừ tạm ứng lương — post-tax, one_time_date"),
    ("Giảm trừ người phụ thuộc",    True,  False, "4,400,000/người — pre-tax, giảm thu nhập tính thuế; HR nhập per employee"),
]


class Command(BaseCommand):
    help = "Setup HNH Travel payroll: FilingStatus TNCN, BHXH/BHYT/BHTN deductions, allowances"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Update existing records (overwrite)",
        )

    def handle(self, *args, **options):
        force = options["force"]
        # Allowance/Deduction.save() accesses request.session — provide a stub
        horilla_middlewares._thread_locals.request = _MockRequest()

        company = (
            Company.objects.filter(company="Công ty Du lịch Hồng Ngọc Hà").first()
            or Company.objects.filter(company__icontains="Hồng Ngọc Hà").first()
            or Company.objects.filter(company__icontains="HNH").first()
            or Company.objects.first()
        )
        if not company:
            self.stdout.write(
                self.style.ERROR(
                    "❌ Không tìm thấy công ty nào trong hệ thống.\n"
                    "   Hãy chạy 'python manage.py setup_hnh_company' trước."
                )
            )
            return
        self.stdout.write(f"  Công ty: {company.company}")

        # ── 1. FilingStatus — Thuế TNCN ──────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\n[1/5] Cấu hình thuế TNCN"))
        filing, created = FilingStatus.objects.get_or_create(
            filing_status="Thuế TNCN Việt Nam",
            defaults={
                "based_on": "taxable_gross_pay",
                "use_py": True,
                "python_code": TNCN_PYTHON_CODE,
                "description": (
                    "Biểu thuế TNCN lũy tiến 7 bậc theo Luật Thuế TNCN VN. "
                    "Thu nhập tính thuế = Tổng thu nhập − BH NLĐ − Giảm trừ bản thân (11tr) − Giảm trừ NPT (4.4tr/người)."
                ),
                "company_id": company,
            },
        )
        if not created and force:
            filing.based_on = "taxable_gross_pay"
            filing.use_py = True
            filing.python_code = TNCN_PYTHON_CODE
            filing.company_id = company
            filing.save()
        self._log(created, force, "Thuế TNCN Việt Nam (7 bậc lũy tiến)")

        # ── 2. Deductions bắt buộc cho tất cả NV ────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\n[2/5] Các khoản khấu trừ bắt buộc"))

        mandatory_deductions = [
            {
                "title": "BHXH NLĐ (8%)",
                "is_pretax": True,
                "is_tax": False,
                "is_fixed": False,
                "based_on": "basic_pay",
                "rate": BHXH_RATE,
                "employer_rate": 17.5,
                "has_max_limit": True,
                "maximum_amount": BHXH_MAX,
                "note": f"BHXH NLĐ 8% — trần {BHXH_BHYT_CEILING:,.0f} VND → tối đa {BHXH_MAX:,.0f} VND/tháng",
            },
            {
                "title": "BHYT NLĐ (1.5%)",
                "is_pretax": True,
                "is_tax": False,
                "is_fixed": False,
                "based_on": "basic_pay",
                "rate": BHYT_RATE,
                "employer_rate": 3.0,
                "has_max_limit": True,
                "maximum_amount": BHYT_MAX,
                "note": f"BHYT NLĐ 1.5% — trần {BHXH_BHYT_CEILING:,.0f} VND → tối đa {BHYT_MAX:,.0f} VND/tháng",
            },
            {
                "title": "BHTN NLĐ (1%)",
                "is_pretax": True,
                "is_tax": False,
                "is_fixed": False,
                "based_on": "basic_pay",
                "rate": BHTN_RATE,
                "employer_rate": 1.0,
                "has_max_limit": True,
                "maximum_amount": BHTN_MAX,
                "note": f"BHTN NLĐ 1% — trần {BHTN_CEILING:,.0f} VND → tối đa {BHTN_MAX:,.0f} VND/tháng",
            },
            {
                "title": "Quỹ Công Đoàn (1%)",
                "is_pretax": True,
                "is_tax": False,
                "is_fixed": False,
                "based_on": "gross_pay",
                "rate": UNION_RATE,
                "employer_rate": 2.0,
                "has_max_limit": False,
                "maximum_amount": None,
                "note": "Quỹ Công Đoàn NLĐ 1% gross — NSDLĐ đóng thêm 2% gross",
            },
            {
                "title": "Giảm trừ bản thân TNCN (11tr)",
                "is_pretax": True,
                "is_tax": False,
                "is_fixed": True,
                "based_on": None,
                "rate": None,
                "employer_rate": 0.0,
                "has_max_limit": False,
                "maximum_amount": None,
                "amount": PERSONAL_DEDUCTION,
                "note": "Giảm trừ gia cảnh bản thân — 11,000,000 VND/tháng (Nghị định 954/2020/UBTVQH14)",
            },
        ]

        for cfg in mandatory_deductions:
            defaults = {
                "is_pretax": cfg["is_pretax"],
                "is_tax": cfg["is_tax"],
                "is_fixed": cfg["is_fixed"],
                "include_active_employees": True,
                "employer_rate": cfg["employer_rate"],
                "has_max_limit": cfg["has_max_limit"],
                "company_id": company,
                "if_condition": "gt",
                "if_amount": 0.0,
                "if_choice": "basic_pay",
            }
            if cfg["is_fixed"]:
                defaults["amount"] = cfg["amount"]
            else:
                defaults["based_on"] = cfg["based_on"]
                defaults["rate"] = cfg["rate"]
            if cfg["has_max_limit"] and cfg["maximum_amount"] is not None:
                defaults["maximum_amount"] = cfg["maximum_amount"]

            ded, created = _goc(Deduction, {"title": cfg["title"]}, defaults, force)
            self._log(created, force, cfg["title"] + (f"  ({cfg['note']})" if not created else ""))

        # ── 3. Allowances cho tất cả NV ─────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\n[3/5] Phụ cấp toàn công ty"))

        for title, is_taxable, amount, note in STANDARD_ALLOWANCES:
            defaults = {
                "is_fixed": True,
                "amount": amount,
                "is_taxable": is_taxable,
                "include_active_employees": True,
                "company_id": company,
                "if_condition": "gt",
                "if_amount": 0.0,
            }
            alw, created = _goc(Allowance, {"title": title}, defaults, force)
            taxable_label = "chịu thuế" if is_taxable else "miễn thuế"
            self._log(created, force, f"{title} ({amount:,.0f} VND, {taxable_label})")
            if not created:
                self.stdout.write(f"    → {note}")

        # ── 4. Allowance templates (per employee) ────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\n[4/5] Khoản thu nhập theo nhân viên (templates)"))
        self.stdout.write(
            "  ℹ Các mục này là mẫu — HR cần vào Payroll > Allowances để\n"
            "    chỉ định nhân viên cụ thể và nhập số tiền.\n"
        )

        for title, is_taxable, note in PER_EMPLOYEE_ALLOWANCE_TEMPLATES:
            defaults = {
                "is_fixed": True,
                "amount": 0.0,
                "is_taxable": is_taxable,
                "include_active_employees": False,
                "company_id": company,
                "if_condition": "gt",
                "if_amount": 0.0,
            }
            alw, created = _goc(Allowance, {"title": title}, defaults, force)
            taxable_label = "chịu thuế" if is_taxable else "miễn thuế"
            mark = "✔" if created else " "
            self.stdout.write(f"  {mark} {title} ({taxable_label})")
            self.stdout.write(f"      → {note}")

        # ── 5. Deduction templates (per employee) ────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\n[5/5] Khoản khấu trừ theo nhân viên (templates)"))
        self.stdout.write(
            "  ℹ Các mục này là mẫu — HR cần vào Payroll > Deductions để\n"
            "    chỉ định nhân viên và ngày áp dụng (one_time_date).\n"
        )

        for title, is_pretax, is_tax, note in PER_EMPLOYEE_DEDUCTION_TEMPLATES:
            defaults = {
                "is_pretax": is_pretax,
                "is_tax": is_tax,
                "is_fixed": True,
                "amount": 0.0,
                "include_active_employees": False,
                "employer_rate": 0.0,
                "company_id": company,
                "if_condition": "gt",
                "if_amount": 0.0,
                "if_choice": "basic_pay",
            }
            ded, created = _goc(Deduction, {"title": title}, defaults, force)
            pretax_label = "pre-tax" if is_pretax else "post-tax"
            mark = "✔" if created else " "
            self.stdout.write(f"  {mark} {title} ({pretax_label})")
            self.stdout.write(f"      → {note}")

        # ── Hoàn tất ─────────────────────────────────────────────────────────
        self.stdout.write(self.style.SUCCESS("\n✅ Hoàn tất cấu hình payroll HNH!"))
        self.stdout.write(
            "\n📋 Bước tiếp theo cho HR:\n"
            "\n  1. Vào Payroll > Contracts → tạo hợp đồng cho từng nhân viên\n"
            "     • Điền 'Lương hợp đồng' vào trường Basic Salary\n"
            "     • Gán Filing Status = 'Thuế TNCN Việt Nam'\n"
            "\n  2. Vào Payroll > Allowances → chỉ định nhân viên cho từng khoản:\n"
            "     • Lương hiệu suất công việc: nhập số tiền + chọn nhân viên\n"
            "     • Phụ cấp xăng xe, điện thoại: nhập mức + chọn nhân viên\n"
            "     • Thưởng KPI tháng: thêm Allowance mới với one_time_date trong tháng\n"
            "     • Thưởng kinh doanh H1/H2: one_time_date tháng 1 hoặc tháng 7\n"
            "\n  3. Vào Payroll > Deductions → cấu hình:\n"
            "     • Giảm trừ NPT: 4,400,000 × số người phụ thuộc, per employee, pre-tax\n"
            "     • Phạt KPI tháng: nhập số tiền + one_time_date + chọn nhân viên\n"
            "     • Tạm ứng lương/hiệu suất: nhập số tiền + one_time_date khi có phát sinh\n"
            "\n  4. Vào Payroll > Payslips → tạo bảng lương tháng\n"
            "     • Kiểm tra kết quả 2–3 tháng đầu song song với Excel\n"
            "\n⚠️  Lưu ý quan trọng:\n"
            "   • Cập nhật BHXH_BHYT_CEILING và BHTN_CEILING nếu mức lương cơ sở thay đổi\n"
            "   • Cập nhật Giảm trừ bản thân nếu Quốc hội điều chỉnh (hiện 11tr/tháng)\n"
            "   • Giảm trừ NPT hiện 4,400,000 VND/người/tháng\n"
        )

    def _log(self, created, force, label):
        if created:
            self.stdout.write(self.style.SUCCESS(f"  ✔ Đã tạo: {label}"))
        elif force:
            self.stdout.write(self.style.WARNING(f"  ↺ Đã cập nhật: {label}"))
        else:
            self.stdout.write(f"    Đã tồn tại: {label}")
