"""
pit_models.py

Vietnamese Personal Income Tax (Thuế TNCN) calculation.

Tax brackets (Biểu thuế lũy tiến từng phần) per Luật Thuế TNCN 2025
(effective 01/01/2026, Nghị quyết 110/2025/UBTVQH15):
  Bậc 1: ≤ 10,000,000đ/tháng         → 5%
  Bậc 2: 10,000,001 – 30,000,000đ    → 10%
  Bậc 3: 30,000,001 – 60,000,000đ    → 20%
  Bậc 4: 60,000,001 – 100,000,000đ   → 30%
  Bậc 5: > 100,000,000đ              → 35%

Deductions (Giảm trừ):
  Bản thân (GTBT): 15,500,000đ/tháng  (Nghị quyết 110/2025/UBTVQH15)
  NPT (GTNPT):     6,200,000đ/NPT/tháng

Historical (pre-2026, Luật TNCN 2007 sửa đổi 2012, NQ 954/2020):
  7 bậc: 5%/10%/15%/20%/25%/30%/35%
  GTBT: 11,000,000đ, GTNPT: 4,400,000đ
"""

from django.db import models
from django.utils.translation import gettext_lazy as _

from base.horilla_company_manager import HorillaCompanyManager
from base.models import Company
from horilla.models import HorillaModel

# VN tax brackets 2026 (Luật Thuế TNCN 2025, effective 01/01/2026):
# (upper_limit_VND, rate_pct). Last bracket has upper=None.
VN_TAX_BRACKETS = [
    (10_000_000,  5),
    (30_000_000, 10),
    (60_000_000, 20),
    (100_000_000, 30),
    (None,        35),
]

# Historical 7-bracket schedule (Luật TNCN 2007 sửa đổi 2012, pre-2026)
VN_TAX_BRACKETS_LEGACY = [
    (5_000_000,  5),
    (10_000_000, 10),
    (18_000_000, 15),
    (32_000_000, 20),
    (52_000_000, 25),
    (80_000_000, 30),
    (None,       35),
]


def calculate_pit(taxable_income: int) -> int:
    """
    Calculate monthly PIT using progressive bracket method.
    taxable_income: Thu nhập tính thuế (VND, integer, ≥ 0).
    Returns PIT amount (VND, integer).
    """
    if taxable_income <= 0:
        return 0

    tax = 0
    prev_limit = 0
    for upper, rate in VN_TAX_BRACKETS:
        if upper is None:
            bracket_income = taxable_income - prev_limit
        else:
            bracket_income = min(taxable_income, upper) - prev_limit
            if bracket_income <= 0:
                break
        tax += int(bracket_income * rate / 100)
        if upper is not None and taxable_income <= upper:
            break
        if upper is not None:
            prev_limit = upper

    return tax


class PITConfig(HorillaModel):
    """
    Company-level PIT configuration. Stores deduction thresholds.
    Update when government changes the deduction amounts.
    """

    company_id = models.ForeignKey(
        Company, null=True, blank=True, on_delete=models.SET_NULL, verbose_name="Công ty"
    )
    personal_deduction = models.BigIntegerField(
        default=15_500_000,
        verbose_name="Giảm trừ bản thân (VND/tháng)",
        help_text="Nghị quyết 110/2025/UBTVQH15 (từ 01/01/2026): 15,500,000đ/tháng.",
    )
    npt_deduction = models.BigIntegerField(
        default=6_200_000,
        verbose_name="Giảm trừ NPT (VND/người/tháng)",
        help_text="6,200,000đ mỗi NPT được duyệt (từ 01/01/2026).",
    )
    effective_from = models.DateField(verbose_name="Hiệu lực từ ngày")
    is_active = models.BooleanField(default=True, verbose_name="Đang hiệu lực")
    note = models.TextField(blank=True, verbose_name="Ghi chú")

    objects = HorillaCompanyManager("company_id")

    class Meta:
        verbose_name = "Cấu hình Thuế TNCN"
        verbose_name_plural = "Cấu hình Thuế TNCN"
        ordering = ["-effective_from"]

    def __str__(self):
        return f"PIT Config hiệu lực {self.effective_from}"

    def compute_for_employee(self, employee, gross_income: int, bhxh_ee: int, npt_count: int) -> dict:
        """
        Compute monthly PIT for one employee.
        gross_income: Tổng thu nhập chịu thuế trong tháng (VND).
        bhxh_ee:      BHXH NLĐ đã đóng trong tháng (VND).
        npt_count:    Số NPT đang được duyệt.
        Returns dict with breakdown.
        """
        npt_deduction_total = self.npt_deduction * npt_count
        total_deductions = bhxh_ee + self.personal_deduction + npt_deduction_total
        taxable_income = max(0, gross_income - total_deductions)
        pit_amount = calculate_pit(taxable_income)

        return {
            "gross_income": gross_income,
            "bhxh_deduction": bhxh_ee,
            "personal_deduction": self.personal_deduction,
            "npt_count": npt_count,
            "npt_deduction_total": npt_deduction_total,
            "total_deductions": total_deductions,
            "taxable_income": taxable_income,
            "pit_amount": pit_amount,
        }


class PITCalculation(HorillaModel):
    """
    Monthly PIT calculation record per employee.
    Auto-computed alongside BHXH; can also be triggered manually.
    """

    employee = models.ForeignKey(
        "employee.Employee",
        on_delete=models.CASCADE,
        related_name="pit_calculations",
        verbose_name="Nhân viên",
    )
    payslip = models.ForeignKey(
        "payroll.Payslip",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="pit_calculations",
        verbose_name="Phiếu lương",
    )
    config = models.ForeignKey(
        PITConfig,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="Cấu hình TNCN áp dụng",
    )

    period_year = models.IntegerField(verbose_name="Năm")
    period_month = models.IntegerField(verbose_name="Tháng")

    # Income
    gross_income = models.BigIntegerField(default=0, verbose_name="Thu nhập chịu thuế (VND)")

    # Deductions
    bhxh_deduction = models.BigIntegerField(default=0, verbose_name="Trừ BHXH NLĐ (VND)")
    personal_deduction = models.BigIntegerField(default=15_500_000, verbose_name="Giảm trừ bản thân (VND)")
    npt_count = models.IntegerField(default=0, verbose_name="Số NPT")
    npt_deduction_total = models.BigIntegerField(default=0, verbose_name="Tổng giảm trừ NPT (VND)")
    total_deductions = models.BigIntegerField(default=0, verbose_name="Tổng giảm trừ (VND)")

    # Result
    taxable_income = models.BigIntegerField(default=0, verbose_name="Thu nhập tính thuế (VND)")
    pit_amount = models.BigIntegerField(default=0, verbose_name="Thuế TNCN phải nộp (VND)")

    computed_at = models.DateTimeField(auto_now=True)

    objects = models.Manager()

    class Meta:
        verbose_name = "Thuế TNCN"
        verbose_name_plural = "Thuế TNCN"
        unique_together = ["employee", "period_year", "period_month"]
        ordering = ["-period_year", "-period_month", "employee"]

    def __str__(self):
        return f"TNCN {self.period_month}/{self.period_year} — {self.employee}"

    @property
    def period_label(self):
        return f"Tháng {self.period_month:02d}/{self.period_year}"

    @property
    def net_income(self):
        return self.gross_income - self.bhxh_deduction - self.pit_amount
