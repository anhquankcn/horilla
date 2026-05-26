"""
bhxh_models.py

Vietnamese mandatory social/health/unemployment insurance (BHXH/BHYT/BHTN).

Rates effective July 2024:
  NLĐ:  BHXH 8%, BHYT 1.5%, BHTN 1%   → tổng 10.5%
  NSDLĐ: BHXH 17.5%, BHYT 3%, BHTN 1%, KPCĐ 2% → tổng 23.5% (+KPCĐ)

Caps:
  BHXH/BHYT: 20 × lương cơ sở (2,340,000) = 46,800,000 VND/tháng
  BHTN:       20 × lương tối thiểu vùng (Vùng 1: 4,960,000) = 99,200,000 VND/tháng
"""

from decimal import Decimal

from django.db import models
from django.utils.translation import gettext_lazy as _

from base.horilla_company_manager import HorillaCompanyManager
from base.models import Company
from horilla.models import HorillaModel


class BHXHConfig(HorillaModel):
    """Company-level BHXH configuration. HR can update rates when law changes."""

    company_id = models.ForeignKey(
        Company, null=True, blank=True, on_delete=models.SET_NULL, verbose_name="Công ty"
    )

    # Employee rates (% of insured salary, trừ vào lương NLĐ)
    bhxh_rate_ee = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("8.00"),
        verbose_name="BHXH NLĐ (%)"
    )
    bhyt_rate_ee = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("1.50"),
        verbose_name="BHYT NLĐ (%)"
    )
    bhtn_rate_ee = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("1.00"),
        verbose_name="BHTN NLĐ (%)"
    )

    # Employer rates (% of insured salary, chi phí NSDLĐ)
    bhxh_rate_er = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("17.50"),
        verbose_name="BHXH NSDLĐ (%)"
    )
    bhyt_rate_er = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("3.00"),
        verbose_name="BHYT NSDLĐ (%)"
    )
    bhtn_rate_er = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("1.00"),
        verbose_name="BHTN NSDLĐ (%)"
    )
    kpcd_rate_er = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("2.00"),
        verbose_name="KPCĐ NSDLĐ (%)"
    )

    # Cap parameters (VND/tháng)
    luong_co_so = models.BigIntegerField(
        default=2_340_000,
        verbose_name="Lương cơ sở (VND/tháng)",
        help_text="Mức lương cơ sở theo quy định nhà nước. Cap BHXH/BHYT = 20 × giá trị này."
    )
    luong_toi_thieu_vung = models.BigIntegerField(
        default=4_960_000,
        verbose_name="Lương tối thiểu vùng (VND/tháng)",
        help_text="Vùng 1 (TP.HCM, HN...). Cap BHTN = 20 × giá trị này."
    )

    effective_from = models.DateField(verbose_name="Hiệu lực từ ngày")
    is_active = models.BooleanField(default=True, verbose_name="Đang hiệu lực")
    note = models.TextField(blank=True, verbose_name="Ghi chú")

    objects = HorillaCompanyManager("company_id")

    class Meta:
        verbose_name = "Cấu hình BHXH"
        verbose_name_plural = "Cấu hình BHXH"
        ordering = ["-effective_from"]

    def __str__(self):
        return f"BHXH Config hiệu lực {self.effective_from} ({'active' if self.is_active else 'inactive'})"

    @property
    def cap_bhxh_bhyt(self):
        return self.luong_co_so * 20

    @property
    def cap_bhtn(self):
        return self.luong_toi_thieu_vung * 20

    @property
    def total_ee_rate(self):
        return self.bhxh_rate_ee + self.bhyt_rate_ee + self.bhtn_rate_ee

    @property
    def total_er_rate(self):
        return self.bhxh_rate_er + self.bhyt_rate_er + self.bhtn_rate_er + self.kpcd_rate_er

    def compute_for_employee(self, employee):
        """
        Compute monthly BHXH contributions for one employee using this config.
        Returns dict with all contribution amounts (int VND).
        """
        bhxh_info = getattr(employee, "bhxh_info", None)
        if bhxh_info and bhxh_info.is_exempt:
            return _zero_contribution()

        # Determine insured salary
        raw_salary = 0
        if bhxh_info and bhxh_info.luong_dong_bh:
            raw_salary = int(bhxh_info.luong_dong_bh)
        else:
            contract = (
                employee.contract_set.filter(contract_status="active")
                .order_by("-id")
                .first()
            )
            if contract:
                raw_salary = int(contract.wage or 0)

        luong_bh = min(raw_salary, self.cap_bhxh_bhyt)
        luong_bhtn = min(raw_salary, self.cap_bhtn)

        def pct(rate, base):
            return int(Decimal(str(base)) * rate / 100)

        bhxh_ee = pct(self.bhxh_rate_ee, luong_bh)
        bhyt_ee = pct(self.bhyt_rate_ee, luong_bh)
        bhtn_ee = pct(self.bhtn_rate_ee, luong_bhtn)
        total_ee = bhxh_ee + bhyt_ee + bhtn_ee

        bhxh_er = pct(self.bhxh_rate_er, luong_bh)
        bhyt_er = pct(self.bhyt_rate_er, luong_bh)
        bhtn_er = pct(self.bhtn_rate_er, luong_bhtn)
        kpcd_er = pct(self.kpcd_rate_er, luong_bh)
        total_er = bhxh_er + bhyt_er + bhtn_er + kpcd_er

        return {
            "luong_dong_bh": luong_bh,
            "luong_dong_bhtn": luong_bhtn,
            "bhxh_ee": bhxh_ee,
            "bhyt_ee": bhyt_ee,
            "bhtn_ee": bhtn_ee,
            "total_ee": total_ee,
            "bhxh_er": bhxh_er,
            "bhyt_er": bhyt_er,
            "bhtn_er": bhtn_er,
            "kpcd_er": kpcd_er,
            "total_er": total_er,
        }


def _zero_contribution():
    return {
        "luong_dong_bh": 0,
        "luong_dong_bhtn": 0,
        "bhxh_ee": 0,
        "bhyt_ee": 0,
        "bhtn_ee": 0,
        "total_ee": 0,
        "bhxh_er": 0,
        "bhyt_er": 0,
        "bhtn_er": 0,
        "kpcd_er": 0,
        "total_er": 0,
    }


class EmployeeBHXHInfo(HorillaModel):
    """Per-employee BHXH configuration and insurance IDs."""

    employee = models.OneToOneField(
        "employee.Employee",
        on_delete=models.CASCADE,
        related_name="bhxh_info",
        verbose_name="Nhân viên",
    )
    luong_dong_bh = models.BigIntegerField(
        null=True,
        blank=True,
        verbose_name="Lương đóng BH (VND/tháng)",
        help_text="Để trống nếu dùng lương hợp đồng. Nhập giá trị này nếu lương đóng BH khác lương HĐ.",
    )
    so_bhxh = models.CharField(max_length=20, blank=True, verbose_name="Số sổ BHXH")
    ma_bhyt = models.CharField(max_length=20, blank=True, verbose_name="Mã thẻ BHYT")
    is_exempt = models.BooleanField(
        default=False,
        verbose_name="Miễn đóng BH",
        help_text="Tick nếu nhân viên không thuộc đối tượng đóng BHXH (VD: CTV thời vụ < 1 tháng).",
    )
    exempt_reason = models.TextField(blank=True, verbose_name="Lý do miễn")

    objects = models.Manager()

    class Meta:
        verbose_name = "Thông tin BHXH nhân viên"
        verbose_name_plural = "Thông tin BHXH nhân viên"

    def __str__(self):
        return f"BHXH Info — {self.employee}"


class BHXHContribution(HorillaModel):
    """
    Monthly BHXH contribution record per employee.
    Auto-computed when a payslip is confirmed; can also be computed manually.
    """

    employee = models.ForeignKey(
        "employee.Employee",
        on_delete=models.CASCADE,
        related_name="bhxh_contributions",
        verbose_name="Nhân viên",
    )
    payslip = models.ForeignKey(
        "payroll.Payslip",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="bhxh_contributions",
        verbose_name="Phiếu lương",
    )
    config = models.ForeignKey(
        BHXHConfig,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="Cấu hình BHXH áp dụng",
    )

    period_year = models.IntegerField(verbose_name="Năm")
    period_month = models.IntegerField(verbose_name="Tháng")  # 1–12

    luong_dong_bh = models.BigIntegerField(default=0, verbose_name="Lương đóng BHXH/BHYT (VND)")
    luong_dong_bhtn = models.BigIntegerField(default=0, verbose_name="Lương đóng BHTN (VND)")

    # NLĐ (employee contributions — deducted from salary)
    bhxh_ee = models.BigIntegerField(default=0, verbose_name="BHXH NLĐ (VND)")
    bhyt_ee = models.BigIntegerField(default=0, verbose_name="BHYT NLĐ (VND)")
    bhtn_ee = models.BigIntegerField(default=0, verbose_name="BHTN NLĐ (VND)")
    total_ee = models.BigIntegerField(default=0, verbose_name="Tổng BH NLĐ (VND)")

    # NSDLĐ (employer contributions — company cost)
    bhxh_er = models.BigIntegerField(default=0, verbose_name="BHXH NSDLĐ (VND)")
    bhyt_er = models.BigIntegerField(default=0, verbose_name="BHYT NSDLĐ (VND)")
    bhtn_er = models.BigIntegerField(default=0, verbose_name="BHTN NSDLĐ (VND)")
    kpcd_er = models.BigIntegerField(default=0, verbose_name="KPCĐ NSDLĐ (VND)")
    total_er = models.BigIntegerField(default=0, verbose_name="Tổng BH NSDLĐ (VND)")

    computed_at = models.DateTimeField(auto_now=True)

    objects = models.Manager()

    class Meta:
        verbose_name = "Đóng BHXH"
        verbose_name_plural = "Đóng BHXH"
        unique_together = ["employee", "period_year", "period_month"]
        ordering = ["-period_year", "-period_month", "employee"]

    def __str__(self):
        return f"BHXH {self.period_month}/{self.period_year} — {self.employee}"

    @property
    def period_label(self):
        return f"Tháng {self.period_month:02d}/{self.period_year}"
