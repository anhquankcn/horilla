"""
contract_models.py

3-tier contract system for HNH Travel:
  - TrialContract       (Hop dong UAT PM)
  - OfficialContract    (Hop dong Chinh thuc)
  - PerformanceContract (Hop dong Hieu suat)

All types share ContractBase (abstract). Both TrialContract and
PerformanceContract support Phu luc 1 via ContractKPIAppendix (two
nullable FKs — exactly one is set per row).
"""

from decimal import Decimal

from django.db import models

from base.models import Company, JobPosition
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
    """Hợp đồng UAT PM — test và nghiệm thu công thức, tính năng, batch trước khi áp dụng chính thức."""

    probation_days = models.IntegerField(
        default=60, verbose_name="Số ngày chạy UAT"
    )
    trial_wage_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("100.00"),
        verbose_name="% lương áp dụng UAT",
    )
    base_salary = models.FloatField(
        default=0, verbose_name="Lương hiệu suất (VND/tháng)"
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
        default=0, verbose_name="Lương hiệu suất (VND/tháng)"
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
    """Phụ lục 1: Thu nhập năm & KPI.

    Dùng cho cả TrialContract và PerformanceContract.
    Đúng một trong hai FK (trial_contract, performance_contract) được set.
    """

    trial_contract = models.ForeignKey(
        TrialContract,
        on_delete=models.CASCADE,
        related_name="kpi_appendices",
        verbose_name="Hợp đồng UAT PM",
        null=True,
        blank=True,
    )
    performance_contract = models.ForeignKey(
        PerformanceContract,
        on_delete=models.CASCADE,
        related_name="kpi_appendices",
        verbose_name="Hợp đồng Hiệu suất",
        null=True,
        blank=True,
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
        ordering = ["year"]
        constraints = [
            models.UniqueConstraint(
                fields=["performance_contract", "year"],
                condition=models.Q(performance_contract__isnull=False),
                name="uq_perf_contract_year",
            ),
            models.UniqueConstraint(
                fields=["trial_contract", "year"],
                condition=models.Q(trial_contract__isnull=False),
                name="uq_trial_contract_year",
            ),
        ]


class MonthlyPayrollEntry(HorillaModel):
    """Bảng lương tháng — one row per employee per month.

    Input fields (HR fills in): actual_days, night_shifts, night_shift_rate,
    ot_normal, ot_weekend, ot_holiday, kpi_pct, incentive, bonus,
    other_adjust, npt, tam_ung.

    Pre-filled from contract: lcb_bhxh, total_gross, pc_chuc_vu, pc_travel,
    standard_days.

    All formula columns (J, K, O, S, T, V, W, X, AB, AC-AF, AH, AI, AK)
    are computed in Python from the stored fields.
    """

    employee_id = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="monthly_payroll_entries",
        verbose_name="Nhân viên",
    )
    year = models.IntegerField(verbose_name="Năm")
    month = models.IntegerField(verbose_name="Tháng")
    company = models.ForeignKey(
        Company,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Công ty",
    )

    # Contract source reference (at most one non-null)
    trial_contract = models.ForeignKey(
        TrialContract,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="payroll_entries",
        verbose_name="HĐ UAT PM",
    )
    official_contract = models.ForeignKey(
        OfficialContract,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="payroll_entries",
        verbose_name="HĐ Chính thức",
    )
    performance_contract = models.ForeignKey(
        PerformanceContract,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="payroll_entries",
        verbose_name="HĐ Hiệu suất",
    )

    # ── Pre-filled from contract (editable) ──────────────────────────────
    standard_days = models.DecimalField(
        max_digits=5, decimal_places=1, default=Decimal("26"),
        verbose_name="Ngày công chuẩn (E)",
    )
    actual_days = models.DecimalField(
        max_digits=5, decimal_places=1, default=Decimal("0"),
        verbose_name="Ngày công thực tế (F)",
    )
    lcb_bhxh = models.DecimalField(
        max_digits=14, decimal_places=0, default=0,
        verbose_name="LCB đóng BHXH (G)",
    )
    total_gross = models.DecimalField(
        max_digits=14, decimal_places=0, default=0,
        verbose_name="Tổng Gross TT (H)",
    )
    pc_chuc_vu = models.DecimalField(
        max_digits=12, decimal_places=0, default=0,
        verbose_name="PC Chức vụ (I)",
    )
    pc_travel = models.DecimalField(
        max_digits=12, decimal_places=0, default=0,
        verbose_name="PC Đi lại (L)",
    )

    # ── HR manual input ───────────────────────────────────────────────────
    night_shifts = models.DecimalField(
        max_digits=6, decimal_places=1, default=0,
        verbose_name="Số ca đêm (M)",
    )
    night_shift_rate = models.DecimalField(
        max_digits=10, decimal_places=0, default=250000,
        verbose_name="Đơn giá ca đêm (N)",
    )
    ot_normal = models.DecimalField(
        max_digits=7, decimal_places=2, default=0,
        verbose_name="Giờ OT ngày thường (P)",
    )
    ot_weekend = models.DecimalField(
        max_digits=7, decimal_places=2, default=0,
        verbose_name="Giờ OT cuối tuần (Q)",
    )
    ot_holiday = models.DecimalField(
        max_digits=7, decimal_places=2, default=0,
        verbose_name="Giờ OT ngày lễ (R)",
    )
    kpi_pct = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal("100.00"),
        verbose_name="% KPI tháng (U)",
    )
    incentive = models.DecimalField(
        max_digits=14, decimal_places=0, default=0,
        verbose_name="Incentive (Y)",
    )
    bonus = models.DecimalField(
        max_digits=14, decimal_places=0, default=0,
        verbose_name="Bonus / T13 (Z)",
    )
    other_adjust = models.DecimalField(
        max_digits=14, decimal_places=0, default=0,
        verbose_name="Phát sinh khác (AA)",
    )
    npt = models.IntegerField(default=0, verbose_name="Số NPT (AG)")
    tam_ung = models.DecimalField(
        max_digits=14, decimal_places=0, default=0,
        verbose_name="Tạm ứng (AJ)",
    )
    notes = models.TextField(blank=True, verbose_name="Ghi chú")

    class Meta:
        verbose_name = "Bảng lương tháng"
        verbose_name_plural = "Bảng lương tháng"
        unique_together = [("employee_id", "year", "month")]
        ordering = [
            "employee_id__employee_work_info__department_id__department",
            "employee_id__employee_last_name",
        ]

    def __str__(self):
        contract = self.trial_contract or self.performance_contract
        return f"Phụ lục 1 — {contract} — Năm {self.year}"

    @property
    def contract(self):
        return self.trial_contract or self.performance_contract
