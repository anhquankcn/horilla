"""
contract_models.py

3-tier contract system for HNH Travel:
  - TrialContract       (Hop dong Thu viec)
  - OfficialContract    (Hop dong Chinh thuc)
  - PerformanceContract (Hop dong Hieu suat) + ContractKPIAppendix

Each type shares a common abstract base (ContractBase) with:
  - Phu luc 2: M2M to existing Allowance / Deduction models
  - Phu luc 3: consent_agreed / consent_date boolean+date
"""

from decimal import Decimal

from django.db import models
from django.utils.translation import gettext_lazy as _

from base.models import JobPosition
from employee.models import Employee
from horilla.models import HorillaModel


CONTRACT_STATUS_CHOICES = [
    ("draft",      "Nháp"),
    ("active",     "Hiệu lực"),
    ("expired",    "Hết hạn"),
    ("terminated", "Chấm dứt"),
]


class ContractBase(HorillaModel):
    """Abstract base for all 3 HNH contract types. Not stored in DB."""

    employee_id = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="%(class)s_set",
        verbose_name="Nhân viên",
    )
    contract_name = models.CharField(max_length=250, verbose_name="Tên hợp đồng")
    contract_start_date = models.DateField(verbose_name="Ngày bắt đầu")
    contract_end_date = models.DateField(
        null=True, blank=True, verbose_name="Ngày kết thúc"
    )
    wage = models.FloatField(default=0, verbose_name="Lương cơ bản (VND/tháng)")
    contract_status = models.CharField(
        max_length=20,
        choices=CONTRACT_STATUS_CHOICES,
        default="draft",
        verbose_name="Trạng thái",
    )

    # Phu luc 3 — bao mat du lieu
    consent_agreed = models.BooleanField(
        default=False,
        verbose_name="Đã ký Phụ lục 3 (đồng ý bảo mật dữ liệu)",
    )
    consent_date = models.DateField(
        null=True, blank=True, verbose_name="Ngày ký Phụ lục 3"
    )

    class Meta:
        abstract = True

    def __str__(self):
        return f"{self.contract_name} — {self.employee_id}"


class TrialContract(ContractBase):
    """Hợp đồng UAT PM — dùng để test và nghiệm thu công thức, tính năng, batch trước khi áp dụng chính thức."""

    probation_days = models.IntegerField(
        default=60, verbose_name="Số ngày chạy UAT"
    )
    trial_wage_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("100.00"),
        verbose_name="% lương áp dụng UAT",
    )

    # Phu luc 2
    allowances = models.ManyToManyField(
        "payroll.Allowance",
        blank=True,
        verbose_name="Phụ cấp (Phụ lục 2)",
        related_name="trial_contracts",
    )
    deductions = models.ManyToManyField(
        "payroll.Deduction",
        blank=True,
        verbose_name="Khoản trừ (Phụ lục 2)",
        related_name="trial_contracts",
    )

    class Meta:
        verbose_name = "Hợp đồng UAT PM"
        verbose_name_plural = "Hợp đồng UAT PM"
        ordering = ["-contract_start_date"]


class OfficialContract(ContractBase):
    """Hợp đồng Chính thức."""

    # Phu luc 2
    allowances = models.ManyToManyField(
        "payroll.Allowance",
        blank=True,
        verbose_name="Phụ cấp (Phụ lục 2)",
        related_name="official_contracts",
    )
    deductions = models.ManyToManyField(
        "payroll.Deduction",
        blank=True,
        verbose_name="Khoản trừ (Phụ lục 2)",
        related_name="official_contracts",
    )

    class Meta:
        verbose_name = "Hợp đồng Chính thức"
        verbose_name_plural = "Hợp đồng Chính thức"
        ordering = ["-contract_start_date"]


class PerformanceContract(ContractBase):
    """Hợp đồng Hiệu suất (KPI-based). Phu luc 1 via ContractKPIAppendix FK."""

    base_salary = models.FloatField(
        default=0, verbose_name="Lương cơ bản (VND/tháng)"
    )

    # Phu luc 2
    allowances = models.ManyToManyField(
        "payroll.Allowance",
        blank=True,
        verbose_name="Phụ cấp (Phụ lục 2)",
        related_name="performance_contracts",
    )
    deductions = models.ManyToManyField(
        "payroll.Deduction",
        blank=True,
        verbose_name="Khoản trừ (Phụ lục 2)",
        related_name="performance_contracts",
    )

    class Meta:
        verbose_name = "Hợp đồng Hiệu suất"
        verbose_name_plural = "Hợp đồng Hiệu suất"
        ordering = ["-contract_start_date"]


class ContractKPIAppendix(HorillaModel):
    """Phụ lục 1: Thu nhập năm & KPI — chỉ dành cho PerformanceContract."""

    contract = models.ForeignKey(
        PerformanceContract,
        on_delete=models.CASCADE,
        related_name="kpi_appendices",
        verbose_name="Hợp đồng Hiệu suất",
    )
    year = models.IntegerField(verbose_name="Năm áp dụng")
    position = models.ForeignKey(
        JobPosition,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Vị trí áp dụng",
    )
    annual_income_min = models.BigIntegerField(
        verbose_name="Thu nhập năm tối thiểu (VND)"
    )
    annual_income_max = models.BigIntegerField(
        verbose_name="Thu nhập năm tối đa (VND)"
    )
    kpi_description = models.TextField(blank=True, verbose_name="Mô tả chỉ số KPI")

    # Muc luong theo % KPI dat duoc
    kpi_pct_90_100 = models.FloatField(
        default=100.0, verbose_name="Bonus rate khi KPI 90-100% (%)"
    )
    kpi_pct_75_89 = models.FloatField(
        default=75.0, verbose_name="Bonus rate khi KPI 75-89% (%)"
    )
    kpi_pct_60_74 = models.FloatField(
        default=50.0, verbose_name="Bonus rate khi KPI 60-74% (%)"
    )
    kpi_below_60 = models.FloatField(
        default=0.0, verbose_name="Bonus rate khi KPI <60% (%)"
    )

    monthly_performance_advance = models.BigIntegerField(
        default=0,
        verbose_name="Tạm ứng lương hiệu suất tháng (VND)",
    )

    class Meta:
        verbose_name = "Phụ lục 1 — KPI & Thu nhập"
        verbose_name_plural = "Phụ lục 1 — KPI & Thu nhập"
        unique_together = [("contract", "year")]
        ordering = ["year"]

    def __str__(self):
        return f"Phụ lục 1 — {self.contract} — Năm {self.year}"
