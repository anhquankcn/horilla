"""
contract_hnh_views.py

HR-facing CRUD views for HNH's 3 contract types:
  - TrialContract / OfficialContract / PerformanceContract
  - ContractKPIAppendix (Phu luc 1, for both Trial and Performance)
"""

import calendar
import io
import json
import logging
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import models
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render

from base.models import Company, Department, JobPosition
from employee.models import Employee
from payroll.models.bhxh_models import BHXHConfig
from payroll.models.contract_models import (
    ContractKPIAppendix,
    MonthlyPayrollEntry,
    OfficialContract,
    PerformanceContract,
    TrialContract,
)
from payroll.models.dependent import EmployeeDependent
from payroll.models.models import Allowance, Contract as HorillaContract, Deduction
from payroll.utils.salary_data import get_annual_salary

logger = logging.getLogger(__name__)

_PAGE_SIZE = 50


def _get_allowances_deductions():
    return (
        Allowance.objects.filter(is_active=True).order_by("title"),
        Deduction.objects.filter(is_active=True).order_by("title"),
    )


def _read_base(post, errors):
    contract_name = post.get("contract_name", "").strip()
    if not contract_name:
        errors["contract_name"] = "Vui lòng nhập tên hợp đồng."

    employee_id_val = post.get("employee_id") or None
    employee = None
    if employee_id_val:
        try:
            employee = Employee.objects.get(pk=employee_id_val)
        except Employee.DoesNotExist:
            errors["employee_id"] = "Nhân viên không tồn tại."
    else:
        errors["employee_id"] = "Vui lòng chọn nhân viên."

    start_str = post.get("contract_start_date", "").strip()
    end_str = post.get("contract_end_date", "").strip()
    if not start_str:
        errors["contract_start_date"] = "Vui lòng nhập ngày bắt đầu."

    try:
        wage = float(post.get("wage", 0))
    except (ValueError, TypeError):
        errors["wage"] = "Lương không hợp lệ."
        wage = 0

    contract_status = post.get("contract_status", "draft")
    consent_agreed = post.get("consent_agreed") == "on"
    consent_date_str = post.get("consent_date", "").strip() or None

    return {
        "contract_name": contract_name,
        "employee": employee,
        "start_str": start_str,
        "end_str": end_str,
        "wage": wage,
        "contract_status": contract_status,
        "consent_agreed": consent_agreed,
        "consent_date_str": consent_date_str,
    }


def _parse_kpi_post(post):
    def _flt(name, default):
        try:
            return float(post.get(name, default))
        except (ValueError, TypeError):
            return float(default)

    def _big(name, default=0):
        try:
            return int(str(post.get(name, default)).replace(",", "").replace(".", ""))
        except (ValueError, TypeError):
            return int(default)

    return {
        "year": None,  # filled by caller
        "position_id": post.get("position") or None,
        "annual_income_min": _big("annual_income_min"),
        "annual_income_max": _big("annual_income_max"),
        "kpi_description": post.get("kpi_description", ""),
        "kpi_pct_90_100": _flt("kpi_pct_90_100", 100),
        "kpi_pct_75_89": _flt("kpi_pct_75_89", 75),
        "kpi_pct_60_74": _flt("kpi_pct_60_74", 50),
        "kpi_below_60": _flt("kpi_below_60", 0),
        "monthly_performance_advance": _big("monthly_performance_advance"),
    }


# ─── TrialContract ────────────────────────────────────────────────────────────


def _contract_stats(base_qs):
    """Return status counts dict for a contract queryset (no filters applied)."""
    counts = {r["contract_status"]: r["cnt"] for r in
              base_qs.values("contract_status").annotate(cnt=models.Count("id"))}
    return {
        "total":      base_qs.count(),
        "active":     counts.get("active", 0),
        "draft":      counts.get("draft", 0),
        "expired":    counts.get("expired", 0),
        "terminated": counts.get("terminated", 0),
    }


@login_required
def trial_contract_list(request):
    base_qs = (
        TrialContract.objects
        .select_related("employee_id", "employee_id__employee_work_info__department_id")
        .prefetch_related("kpi_appendices")
    )
    stats = _contract_stats(base_qs)
    qs = base_qs.order_by("-contract_start_date")
    status_filter = request.GET.get("status", "")
    search = request.GET.get("search", "").strip()
    if status_filter:
        qs = qs.filter(contract_status=status_filter)
    if search:
        qs = qs.filter(
            models.Q(contract_name__icontains=search)
            | models.Q(employee_id__employee_first_name__icontains=search)
            | models.Q(employee_id__employee_last_name__icontains=search)
        )
    paginator = Paginator(qs, _PAGE_SIZE)
    page = paginator.get_page(request.GET.get("page", 1))
    return render(request, "payroll/contracts_hnh/trial/list.html", {
        "contracts": page,
        "status_filter": status_filter,
        "search": search,
        "stats": stats,
    })


@login_required
def trial_contract_detail(request, pk):
    obj = get_object_or_404(
        TrialContract.objects.select_related(
            "employee_id",
            "employee_id__employee_work_info__department_id",
            "employee_id__employee_work_info__job_position_id",
        ).prefetch_related("kpi_appendices__position", "allowances", "deductions"),
        pk=pk,
    )
    return render(
        request,
        "payroll/contracts_hnh/trial/detail.html",
        {"contract": obj, "appendices": obj.kpi_appendices.all()},
    )


@login_required
def trial_contract_create(request):
    allowances, deductions = _get_allowances_deductions()
    employees = Employee.objects.filter(is_active=True).order_by("employee_first_name")

    if request.method == "POST":
        errors = {}
        base = _read_base(request.POST, errors)
        try:
            probation_days = int(request.POST.get("probation_days", 60))
        except (ValueError, TypeError):
            probation_days = 60
        try:
            trial_wage_pct = float(request.POST.get("trial_wage_pct", 100))
        except (ValueError, TypeError):
            trial_wage_pct = 100
        try:
            base_salary = float(request.POST.get("base_salary", 0))
        except (ValueError, TypeError):
            base_salary = 0

        if not errors:
            obj = TrialContract.objects.create(
                employee_id=base["employee"],
                contract_name=base["contract_name"],
                contract_start_date=base["start_str"],
                contract_end_date=base["end_str"] or None,
                wage=base["wage"],
                base_salary=base_salary,
                contract_status=base["contract_status"],
                consent_agreed=base["consent_agreed"],
                consent_date=base["consent_date_str"] or None,
                probation_days=probation_days,
                trial_wage_pct=trial_wage_pct,
            )
            obj.allowances.set(request.POST.getlist("allowances"))
            obj.deductions.set(request.POST.getlist("deductions"))
            messages.success(request, f"Đã tạo hợp đồng UAT PM: {obj.contract_name}")
            return redirect("trial-contract-detail", pk=obj.pk)

        return render(request, "payroll/contracts_hnh/trial/form.html", {
            "errors": errors, "post": request.POST,
            "employees": employees, "allowances": allowances, "deductions": deductions,
        })

    return render(request, "payroll/contracts_hnh/trial/form.html", {
        "employees": employees, "allowances": allowances, "deductions": deductions,
    })


@login_required
def trial_contract_update(request, pk):
    import traceback
    try:
        obj = get_object_or_404(TrialContract, pk=pk)
        allowances, deductions = _get_allowances_deductions()
        employees = Employee.objects.filter(is_active=True).order_by("employee_first_name")

        if request.method == "POST":
            errors = {}
            base = _read_base(request.POST, errors)
            try:
                probation_days = int(request.POST.get("probation_days", 60))
            except (ValueError, TypeError):
                probation_days = 60
            try:
                trial_wage_pct = float(request.POST.get("trial_wage_pct", 100))
            except (ValueError, TypeError):
                trial_wage_pct = 100
            try:
                base_salary = float(request.POST.get("base_salary", 0))
            except (ValueError, TypeError):
                base_salary = 0

            if not errors:
                obj.employee_id = base["employee"]
                obj.contract_name = base["contract_name"]
                obj.contract_start_date = base["start_str"]
                obj.contract_end_date = base["end_str"] or None
                obj.wage = base["wage"]
                obj.base_salary = base_salary
                obj.contract_status = base["contract_status"]
                obj.consent_agreed = base["consent_agreed"]
                obj.consent_date = base["consent_date_str"] or None
                obj.probation_days = probation_days
                obj.trial_wage_pct = trial_wage_pct
                obj.save()
                obj.allowances.set(request.POST.getlist("allowances"))
                obj.deductions.set(request.POST.getlist("deductions"))
                messages.success(request, "Đã cập nhật hợp đồng UAT PM.")
                return redirect("trial-contract-detail", pk=obj.pk)

            return render(request, "payroll/contracts_hnh/trial/form.html", {
                "contract": obj, "errors": errors, "post": request.POST,
                "employees": employees, "allowances": allowances, "deductions": deductions,
            })

        return render(request, "payroll/contracts_hnh/trial/form.html", {
            "contract": obj, "employees": employees,
            "allowances": allowances, "deductions": deductions,
        })
    except Exception as _exc:
        logger.error(
            "trial_contract_update EXCEPTION pk=%s user=%s method=%s\n%s",
            pk,
            getattr(request, "user", "?"),
            request.method,
            traceback.format_exc(),
        )
        raise


@login_required
def trial_contract_delete(request, pk):
    obj = get_object_or_404(TrialContract, pk=pk)
    if request.method == "POST":
        obj.delete()
        messages.success(request, "Đã xóa hợp đồng UAT PM.")
    return redirect("trial-contract-list")


# ─── TrialContract KPI Appendix ───────────────────────────────────────────────


@login_required
def trial_kpi_appendix_create(request, contract_pk):
    contract = get_object_or_404(TrialContract, pk=contract_pk)
    departments = Department.objects.order_by("department")

    if request.method == "POST":
        errors = {}
        try:
            year = int(request.POST.get("year", date.today().year))
        except (ValueError, TypeError):
            errors["year"] = "Năm không hợp lệ."
            year = date.today().year

        if ContractKPIAppendix.objects.filter(trial_contract=contract, year=year).exists():
            errors["year"] = f"Phụ lục 1 năm {year} đã tồn tại cho hợp đồng này."

        kpi = _parse_kpi_post(request.POST)
        kpi["year"] = year

        if not errors:
            ContractKPIAppendix.objects.create(
                trial_contract=contract,
                **kpi,
            )
            messages.success(request, f"Đã thêm Phụ lục 1 năm {year}.")
            return redirect("trial-contract-detail", pk=contract_pk)

        return render(request, "payroll/contracts_hnh/kpi_appendix_form.html", {
            "contract": contract, "contract_type": "trial",
            "departments": departments, "errors": errors, "post": request.POST,
        })

    return render(request, "payroll/contracts_hnh/kpi_appendix_form.html", {
        "contract": contract, "contract_type": "trial", "departments": departments,
    })


# ─── OfficialContract ─────────────────────────────────────────────────────────


@login_required
def official_contract_list(request):
    base_qs = OfficialContract.objects.select_related(
        "employee_id", "employee_id__employee_work_info__department_id"
    )
    stats = _contract_stats(base_qs)
    qs = base_qs.order_by("-contract_start_date")
    status_filter = request.GET.get("status", "")
    search = request.GET.get("search", "").strip()
    if status_filter:
        qs = qs.filter(contract_status=status_filter)
    if search:
        qs = qs.filter(
            models.Q(contract_name__icontains=search)
            | models.Q(employee_id__employee_first_name__icontains=search)
            | models.Q(employee_id__employee_last_name__icontains=search)
        )
    paginator = Paginator(qs, _PAGE_SIZE)
    page = paginator.get_page(request.GET.get("page", 1))
    return render(request, "payroll/contracts_hnh/official/list.html", {
        "contracts": page,
        "status_filter": status_filter,
        "search": search,
        "stats": stats,
    })


@login_required
def official_contract_create(request):
    allowances, deductions = _get_allowances_deductions()
    employees = Employee.objects.filter(is_active=True).order_by("employee_first_name")

    if request.method == "POST":
        errors = {}
        base = _read_base(request.POST, errors)

        if not errors:
            obj = OfficialContract.objects.create(
                employee_id=base["employee"],
                contract_name=base["contract_name"],
                contract_start_date=base["start_str"],
                contract_end_date=base["end_str"] or None,
                wage=base["wage"],
                contract_status=base["contract_status"],
                consent_agreed=base["consent_agreed"],
                consent_date=base["consent_date_str"] or None,
            )
            obj.allowances.set(request.POST.getlist("allowances"))
            obj.deductions.set(request.POST.getlist("deductions"))
            messages.success(request, f"Đã tạo hợp đồng chính thức: {obj.contract_name}")
            return redirect("official-contract-list")

        return render(request, "payroll/contracts_hnh/official/form.html", {
            "errors": errors, "post": request.POST,
            "employees": employees, "allowances": allowances, "deductions": deductions,
        })

    return render(request, "payroll/contracts_hnh/official/form.html", {
        "employees": employees, "allowances": allowances, "deductions": deductions,
    })


@login_required
def official_contract_update(request, pk):
    obj = get_object_or_404(OfficialContract, pk=pk)
    allowances, deductions = _get_allowances_deductions()
    employees = Employee.objects.filter(is_active=True).order_by("employee_first_name")

    if request.method == "POST":
        errors = {}
        base = _read_base(request.POST, errors)

        if not errors:
            obj.employee_id = base["employee"]
            obj.contract_name = base["contract_name"]
            obj.contract_start_date = base["start_str"]
            obj.contract_end_date = base["end_str"] or None
            obj.wage = base["wage"]
            obj.contract_status = base["contract_status"]
            obj.consent_agreed = base["consent_agreed"]
            obj.consent_date = base["consent_date_str"] or None
            obj.save()
            obj.allowances.set(request.POST.getlist("allowances"))
            obj.deductions.set(request.POST.getlist("deductions"))
            messages.success(request, "Đã cập nhật hợp đồng chính thức.")
            return redirect("official-contract-list")

        return render(request, "payroll/contracts_hnh/official/form.html", {
            "contract": obj, "errors": errors, "post": request.POST,
            "employees": employees, "allowances": allowances, "deductions": deductions,
        })

    return render(request, "payroll/contracts_hnh/official/form.html", {
        "contract": obj, "employees": employees,
        "allowances": allowances, "deductions": deductions,
    })


@login_required
def official_contract_detail(request, pk):
    obj = get_object_or_404(
        OfficialContract.objects.select_related(
            "employee_id",
            "employee_id__employee_work_info__department_id",
            "employee_id__employee_work_info__job_position_id",
        ).prefetch_related("allowances", "deductions"),
        pk=pk,
    )
    return render(request, "payroll/contracts_hnh/official/detail.html", {"contract": obj})


@login_required
def official_contract_delete(request, pk):
    obj = get_object_or_404(OfficialContract, pk=pk)
    if request.method == "POST":
        obj.delete()
        messages.success(request, "Đã xóa hợp đồng chính thức.")
    return redirect("official-contract-list")


# ─── PerformanceContract + KPI Appendix ──────────────────────────────────────


@login_required
def performance_contract_list(request):
    base_qs = PerformanceContract.objects.select_related(
        "employee_id", "employee_id__employee_work_info__department_id"
    ).prefetch_related("kpi_appendices")
    stats = _contract_stats(base_qs)
    qs = base_qs.order_by("-contract_start_date")
    status_filter = request.GET.get("status", "")
    search = request.GET.get("search", "").strip()
    if status_filter:
        qs = qs.filter(contract_status=status_filter)
    if search:
        qs = qs.filter(
            models.Q(contract_name__icontains=search)
            | models.Q(employee_id__employee_first_name__icontains=search)
            | models.Q(employee_id__employee_last_name__icontains=search)
        )
    paginator = Paginator(qs, _PAGE_SIZE)
    page = paginator.get_page(request.GET.get("page", 1))
    return render(request, "payroll/contracts_hnh/performance/list.html", {
        "contracts": page,
        "status_filter": status_filter,
        "search": search,
        "stats": stats,
    })


@login_required
def performance_contract_create(request):
    allowances, deductions = _get_allowances_deductions()
    employees = Employee.objects.filter(is_active=True).order_by("employee_first_name")

    if request.method == "POST":
        errors = {}
        base = _read_base(request.POST, errors)
        try:
            base_salary = float(request.POST.get("base_salary", 0))
        except (ValueError, TypeError):
            base_salary = 0

        if not errors:
            obj = PerformanceContract.objects.create(
                employee_id=base["employee"],
                contract_name=base["contract_name"],
                contract_start_date=base["start_str"],
                contract_end_date=base["end_str"] or None,
                wage=base["wage"],
                base_salary=base_salary,
                contract_status=base["contract_status"],
                consent_agreed=base["consent_agreed"],
                consent_date=base["consent_date_str"] or None,
            )
            obj.allowances.set(request.POST.getlist("allowances"))
            obj.deductions.set(request.POST.getlist("deductions"))
            messages.success(request, f"Đã tạo hợp đồng hiệu suất: {obj.contract_name}")
            return redirect("performance-contract-detail", pk=obj.pk)

        return render(request, "payroll/contracts_hnh/performance/form.html", {
            "errors": errors, "post": request.POST,
            "employees": employees, "allowances": allowances, "deductions": deductions,
        })

    return render(request, "payroll/contracts_hnh/performance/form.html", {
        "employees": employees, "allowances": allowances, "deductions": deductions,
    })


@login_required
def performance_contract_detail(request, pk):
    obj = get_object_or_404(
        PerformanceContract.objects.select_related(
            "employee_id",
            "employee_id__employee_work_info__department_id",
            "employee_id__employee_work_info__job_position_id",
        ).prefetch_related("kpi_appendices__position", "allowances", "deductions"),
        pk=pk,
    )
    return render(request, "payroll/contracts_hnh/performance/detail.html", {
        "contract": obj,
        "appendices": obj.kpi_appendices.all(),
    })


@login_required
def performance_contract_update(request, pk):
    obj = get_object_or_404(PerformanceContract, pk=pk)
    allowances, deductions = _get_allowances_deductions()
    employees = Employee.objects.filter(is_active=True).order_by("employee_first_name")

    if request.method == "POST":
        errors = {}
        base = _read_base(request.POST, errors)
        try:
            base_salary = float(request.POST.get("base_salary", 0))
        except (ValueError, TypeError):
            base_salary = 0

        if not errors:
            obj.employee_id = base["employee"]
            obj.contract_name = base["contract_name"]
            obj.contract_start_date = base["start_str"]
            obj.contract_end_date = base["end_str"] or None
            obj.wage = base["wage"]
            obj.base_salary = base_salary
            obj.contract_status = base["contract_status"]
            obj.consent_agreed = base["consent_agreed"]
            obj.consent_date = base["consent_date_str"] or None
            obj.save()
            obj.allowances.set(request.POST.getlist("allowances"))
            obj.deductions.set(request.POST.getlist("deductions"))
            messages.success(request, "Đã cập nhật hợp đồng hiệu suất.")
            return redirect("performance-contract-detail", pk=obj.pk)

        return render(request, "payroll/contracts_hnh/performance/form.html", {
            "contract": obj, "errors": errors, "post": request.POST,
            "employees": employees, "allowances": allowances, "deductions": deductions,
        })

    return render(request, "payroll/contracts_hnh/performance/form.html", {
        "contract": obj, "employees": employees,
        "allowances": allowances, "deductions": deductions,
    })


@login_required
def performance_contract_delete(request, pk):
    obj = get_object_or_404(PerformanceContract, pk=pk)
    if request.method == "POST":
        obj.delete()
        messages.success(request, "Đã xóa hợp đồng hiệu suất.")
    return redirect("performance-contract-list")


# ─── ContractKPIAppendix (shared) ────────────────────────────────────────────


@login_required
def kpi_appendix_create(request, contract_pk):
    """KPI appendix for PerformanceContract."""
    contract = get_object_or_404(PerformanceContract, pk=contract_pk)
    departments = Department.objects.order_by("department")

    if request.method == "POST":
        errors = {}
        try:
            year = int(request.POST.get("year", date.today().year))
        except (ValueError, TypeError):
            errors["year"] = "Năm không hợp lệ."
            year = date.today().year

        if ContractKPIAppendix.objects.filter(performance_contract=contract, year=year).exists():
            errors["year"] = f"Phụ lục 1 năm {year} đã tồn tại cho hợp đồng này."

        kpi = _parse_kpi_post(request.POST)
        kpi["year"] = year

        if not errors:
            ContractKPIAppendix.objects.create(performance_contract=contract, **kpi)
            messages.success(request, f"Đã thêm Phụ lục 1 năm {year}.")
            return redirect("performance-contract-detail", pk=contract_pk)

        return render(request, "payroll/contracts_hnh/kpi_appendix_form.html", {
            "contract": contract, "contract_type": "performance",
            "departments": departments, "errors": errors, "post": request.POST,
        })

    return render(request, "payroll/contracts_hnh/kpi_appendix_form.html", {
        "contract": contract, "contract_type": "performance", "departments": departments,
    })


@login_required
def hnh_positions_api(request):
    """JSON API: list positions for a department with salary suggestions.

    GET /payroll/hnh/api/positions/?department_id=<id>
    Returns: [{id, name, annual_min, annual_max, monthly_advance}, ...]
    """
    dept_id = request.GET.get("department_id") or None
    qs = JobPosition.objects.order_by("job_position")
    if dept_id:
        qs = qs.filter(department_id=dept_id)
    data = []
    for pos in qs:
        annual_min, annual_max, monthly_advance = get_annual_salary(pos.job_position)
        data.append({
            "id": pos.pk,
            "name": pos.job_position,
            "annual_min": annual_min,
            "annual_max": annual_max,
            "monthly_advance": monthly_advance,
        })
    return JsonResponse({"positions": data})


# ─── Payroll formula helpers ───────────────────────────────────────────────────

_BHXH_RATE_EE = Decimal("0.08")
_BHYT_RATE_EE = Decimal("0.015")
_BHTN_RATE_EE = Decimal("0.01")
_PERSONAL_DEDUCTION = Decimal("11000000")
_DEPENDENT_DEDUCTION = Decimal("4400000")
_NIGHT_SHIFT_RATE_DEFAULT = Decimal("250000")


_CONTRACT_TYPE_CHOICES = [
    ("",            "Tất cả loại HĐ"),
    ("trial",       "HNH Trial (Thử việc)"),
    ("official",    "HNH Chính thức"),
    ("performance", "HNH Hiệu suất"),
    ("horilla",     "Horilla (Chuẩn)"),
    ("no_contract", "Không có HĐ"),
]

_CONTRACT_STATUS_LABELS = {
    "draft":      "Nháp",
    "active":     "Hiệu lực",
    "expired":    "Hết hạn",
    "terminated": "Chấm dứt",
}

_CONTRACT_STATUS_CHOICES = [
    ("",            "Tất cả trạng thái"),
    ("active",      "Hiệu lực"),
    ("draft",       "Nháp"),
    ("expired",     "Hết hạn"),
    ("terminated",  "Chấm dứt"),
]


def _get_bhxh_caps():
    cfg = BHXHConfig.objects.filter(is_active=True).first()
    if cfg:
        return (
            Decimal(str(cfg.luong_co_so)) * 20,
            Decimal(str(cfg.luong_toi_thieu_vung)) * 20,
        )
    return Decimal("46800000"), Decimal("99200000")


def _contract_validity(entry: MonthlyPayrollEntry, period_start, period_end) -> dict:
    """
    Check whether the contract linked to a payroll entry is valid for the period.
    Returns: ctype_key, ctype_label, contract_ok (bool), warnings (list[str]).
    """
    if entry.trial_contract_id:
        c = entry.trial_contract
        ctype_key, ctype_label = "trial", "HNH Trial"
    elif entry.official_contract_id:
        c = entry.official_contract
        ctype_key, ctype_label = "official", "HNH Chính thức"
    elif entry.performance_contract_id:
        c = entry.performance_contract
        ctype_key, ctype_label = "performance", "HNH Hiệu suất"
    else:
        horilla_c = HorillaContract.objects.filter(
            employee_id=entry.employee_id,
            contract_status="active",
            contract_start_date__lte=period_end,
        ).filter(
            models.Q(contract_end_date__isnull=True) |
            models.Q(contract_end_date__gte=period_start)
        ).first()
        if horilla_c:
            warnings = []
            if horilla_c.wage is not None and float(horilla_c.wage) == 0:
                warnings.append("Lương = 0")
            return {"ctype_key": "horilla", "ctype_label": "Horilla", "contract": horilla_c, "contract_status": horilla_c.contract_status, "contract_ok": len(warnings) == 0, "warnings": warnings}
        return {"ctype_key": "no_contract", "ctype_label": "—", "contract": None, "contract_status": "none", "contract_ok": False, "warnings": ["Không có hợp đồng"]}

    warnings = []
    status_label = _CONTRACT_STATUS_LABELS.get(c.contract_status, c.contract_status)
    if c.contract_status != "active":
        warnings.append(f"Trạng thái: {status_label}")
    if c.contract_start_date > period_end:
        warnings.append("Chưa bắt đầu trong kỳ")
    if c.contract_end_date and c.contract_end_date < period_start:
        warnings.append(f"Hết hạn {c.contract_end_date.strftime('%d/%m/%Y')}")
    if float(c.wage) == 0:
        warnings.append("Lương = 0")
    if ctype_key == "trial" and hasattr(c, "probation_days") and c.contract_start_date:
        probation_end = c.contract_start_date + timedelta(days=c.probation_days)
        if probation_end < period_start:
            warnings.append(f"Quá hạn UAT ({probation_end.strftime('%d/%m/%Y')})")
    active_count = _count_active_hnh_contracts(entry.employee_id, period_start, period_end)
    if active_count > 1:
        warnings.append(f"{active_count} HĐ HNH active trùng kỳ")

    return {
        "ctype_key":    ctype_key,
        "ctype_label":  ctype_label,
        "contract":     c,
        "contract_status": c.contract_status,
        "contract_ok":  len(warnings) == 0,
        "warnings":     warnings,
    }


def _count_active_hnh_contracts(employee, period_start, period_end) -> int:
    """Count how many HNH contracts are active and overlap with the period."""
    count = 0
    for Model in (TrialContract, OfficialContract, PerformanceContract):
        count += Model.objects.filter(
            employee_id=employee,
            contract_status="active",
            contract_start_date__lte=period_end,
        ).filter(
            models.Q(contract_end_date__isnull=True) |
            models.Q(contract_end_date__gte=period_start)
        ).count()
    return count


def _tncn_progressive(taxable: Decimal) -> Decimal:
    """Progressive PIT (biểu lũy tiến 7 bậc)."""
    if taxable <= 0:
        return Decimal("0")
    brackets = [
        (Decimal("5000000"),  Decimal("0.05")),
        (Decimal("5000000"),  Decimal("0.10")),
        (Decimal("8000000"),  Decimal("0.15")),
        (Decimal("14000000"), Decimal("0.20")),
        (Decimal("20000000"), Decimal("0.25")),
        (Decimal("28000000"), Decimal("0.30")),
        (None,                Decimal("0.35")),
    ]
    tax = Decimal("0")
    remaining = taxable
    for width, rate in brackets:
        if width is None:
            tax += remaining * rate
            break
        chunk = min(remaining, width)
        tax += chunk * rate
        remaining -= chunk
        if remaining <= 0:
            break
    return tax.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def _compute_entry_formulas(e: MonthlyPayrollEntry, bhxh_cap: Decimal, bhtn_cap: Decimal) -> dict:
    """Compute all formula columns for one payroll entry."""
    E = Decimal(str(e.standard_days))
    F = Decimal(str(e.actual_days))
    G = Decimal(str(e.lcb_bhxh))
    H = Decimal(str(e.total_gross))
    I = Decimal(str(e.pc_chuc_vu))
    L = Decimal(str(e.pc_travel))
    M = Decimal(str(e.night_shifts))
    N = Decimal(str(e.night_shift_rate))
    P = Decimal(str(e.ot_normal))
    Q = Decimal(str(e.ot_weekend))
    R = Decimal(str(e.ot_holiday))
    U = Decimal(str(e.kpi_pct)) / 100
    Y = Decimal(str(e.incentive))
    Z = Decimal(str(e.bonus))
    AA = Decimal(str(e.other_adjust))
    AG = Decimal(str(e.npt))
    AJ = Decimal(str(e.tam_ung))

    # J: LCB actual = G × (F/E)
    J = (G * F / E).quantize(Decimal("1"), rounding=ROUND_HALF_UP) if E > 0 else Decimal("0")
    # K: LHS Pool = H - G - L + I
    K = H - G - L + I
    # O: Thưởng ca đêm = M × N
    O = (M * N).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    # S: Đơn giá/giờ = G / (E × 8)
    S = (G / (E * 8)).quantize(Decimal("1"), rounding=ROUND_HALF_UP) if E > 0 else Decimal("0")
    # T: Tổng OT = P×S×4 + Q×S×4.5 + R×S×5
    T = (P * S * 4 + Q * S * Decimal("4.5") + R * S * 5).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    # V: KPI thực nhận = U × K (LHS Pool × KPI%)
    V = (U * K).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    # W: Gap KPI LHS = K - V
    W = K - V
    # X: LCB+LHS+PC = J + V + T + L
    X = J + V + T + L
    # AB: Gross thực tế = X + O + Y + Z + AA
    AB = X + O + Y + Z + AA
    # BHXH / BHYT / BHTN (NLĐ đóng)
    AC = (min(G, bhxh_cap) * _BHXH_RATE_EE).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    AD = (min(G, bhxh_cap) * _BHYT_RATE_EE).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    AE = (min(G, bhtn_cap) * _BHTN_RATE_EE).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    AF = AC + AD + AE
    # AH: Thu nhập chịu thuế = AB - AF - 11tr - NPT×4.4tr
    AH = max(Decimal("0"), AB - AF - _PERSONAL_DEDUCTION - AG * _DEPENDENT_DEDUCTION)
    # AI: Thuế TNCN (tạm tính lũy tiến)
    AI = _tncn_progressive(AH)
    # AK: Thực lĩnh = AB - AF - AI - AJ
    AK = AB - AF - AI - AJ

    return {
        "J": int(J), "K": int(K), "O": int(O), "S": int(S),
        "T": int(T), "V": int(V), "W": int(W), "X": int(X),
        "AB": int(AB), "AC": int(AC), "AD": int(AD), "AE": int(AE),
        "AF": int(AF), "AH": int(AH), "AI": int(AI), "AK": int(AK),
    }


def _allowance_amount_for_keyword(contract, keyword: str) -> Decimal:
    """Sum fixed amounts from allowances whose title contains keyword."""
    total = Decimal("0")
    for a in contract.allowances.all():
        if keyword in a.title.lower().replace(" ", ""):
            if a.is_fixed and a.amount:
                total += Decimal(str(a.amount))
    return total


def _sum_all_fixed_allowances(contract) -> Decimal:
    """Sum all fixed allowances attached to a contract."""
    total = Decimal("0")
    for a in contract.allowances.all():
        if a.is_fixed and a.amount:
            total += Decimal(str(a.amount))
    return total


def _extract_allowances(contract) -> tuple[Decimal, Decimal]:
    """Extract PC Chức vụ and PC Đi lại from contract allowances.
    Returns (pc_chuc_vu, pc_travel).
    """
    pc_cv = _allowance_amount_for_keyword(contract, "chứcvụ")
    if not pc_cv:
        pc_cv = _allowance_amount_for_keyword(contract, "pccv")
    if not pc_cv:
        pc_cv = _allowance_amount_for_keyword(contract, "chucvu")
    pc_travel = _allowance_amount_for_keyword(contract, "đilại")
    if not pc_travel:
        pc_travel = _allowance_amount_for_keyword(contract, "dilai")
    if not pc_travel:
        pc_travel = _allowance_amount_for_keyword(contract, "dichuyen")
    return pc_cv, pc_travel


def _std_working_days(year: int, month: int) -> int:
    first_day = date(year, month, 1)
    last_day  = date(year, month, calendar.monthrange(year, month)[1])
    return sum(
        1 for d in range((last_day - first_day).days + 1)
        if date(year, month, d + 1).weekday() < 5
    )


def _actual_cong(employee, year: int, month: int) -> Decimal:
    """Tổng công thực tế trong tháng theo ALD26: mỗi ngày công = giờ làm / mức tối
    thiểu (9h35), tối đa 1.0; nghỉ phép có lương = 1.0 công. Dùng làm actual_days
    mặc định khi tạo bảng lương (C&B vẫn chỉnh tay được)."""
    from attendance.models import Attendance
    from leave.models import LeaveRequest

    start = date(year, month, 1)
    end = date(year, month, calendar.monthrange(year, month)[1])
    total = 0.0
    for a in Attendance.objects.filter(employee_id=employee, attendance_date__range=[start, end]):
        ws = a.at_work_second or 0
        try:
            mh, mm = map(int, str(a.minimum_hour or "09:35").split(":"))
            denom = mh * 3600 + mm * 60 or 34500
        except Exception:
            denom = 34500
        total += min(1.0, ws / denom)
    # Nghỉ phép có lương = đủ công
    leave_dates = set()
    for lr in LeaveRequest.objects.filter(
        employee_id=employee, status="approved",
        start_date__lte=end, end_date__gte=start,
    ).select_related("leave_type_id"):
        if getattr(lr.leave_type_id, "payment", "unpaid") != "paid":
            continue
        d = lr.start_date
        while d <= (lr.end_date or lr.start_date):
            if start <= d <= end:
                leave_dates.add(d)
            d += timedelta(days=1)
    total += len(leave_dates)
    return Decimal(str(round(total, 2)))


def _build_entry_stub(contract, year: int, month: int, company=None) -> MonthlyPayrollEntry:
    """Build an unsaved MonthlyPayrollEntry stub from an HNH contract.

    Salary mapping per contract type:
      TrialContract (UAT PM):
        G = wage × trial_wage_pct/100  (LCB BHXH — adjusted for trial %)
        H = G + base_salary            (Gross = LCB adjusted + LHS)
      OfficialContract (Chính thức):
        G = wage                        (LCB BHXH = toàn bộ lương cơ bản)
        H = wage                        (Gross = LCB; PC tracked in I/L)
      PerformanceContract (Hiệu suất):
        G = wage                        (LCB BHXH = lương cơ bản)
        H = wage + base_salary          (Gross = LCB + lương hiệu suất)
    """
    ctype = type(contract).__name__
    wage = Decimal(str(contract.wage))

    pc_cv, pc_travel = _extract_allowances(contract)
    total_allowances = _sum_all_fixed_allowances(contract)

    if ctype == "TrialContract":
        trial_pct = Decimal(str(contract.trial_wage_pct)) / Decimal("100")
        G = (wage * trial_pct).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        base_salary = Decimal(str(contract.base_salary))
        H = G + base_salary
    elif ctype == "PerformanceContract":
        G = wage
        base_salary = Decimal(str(contract.base_salary))
        H = G + base_salary
    else:  # OfficialContract — no separate performance pool; I/L tracked separately
        G = wage
        H = wage

    npt_count = EmployeeDependent.objects.filter(
        employee=contract.employee_id, status="approved"
    ).count()

    std_days = _std_working_days(year, month)

    entry = MonthlyPayrollEntry(
        employee_id=contract.employee_id,
        year=year,
        month=month,
        company=company,
        standard_days=Decimal(str(std_days)),
        actual_days=_actual_cong(contract.employee_id, year, month),
        lcb_bhxh=G,
        total_gross=H,
        pc_chuc_vu=pc_cv,
        pc_travel=pc_travel,
        npt=npt_count,
        night_shift_rate=_NIGHT_SHIFT_RATE_DEFAULT,
    )
    if ctype == "TrialContract":
        entry.trial_contract = contract
    elif ctype == "OfficialContract":
        entry.official_contract = contract
    else:
        entry.performance_contract = contract
    return entry


@login_required
def hnh_payroll_overview(request):
    """Bảng lương — editable monthly payroll table, company-scoped."""
    today = date.today()
    try:
        current_month = int(request.GET.get("month", today.month))
        current_year  = int(request.GET.get("year",  today.year))
        if not (1 <= current_month <= 12):
            current_month = today.month
        if not (2020 <= current_year <= 2100):
            current_year = today.year
    except (ValueError, TypeError):
        current_month, current_year = today.month, today.year

    # Company filter from session
    selected_company_id = request.session.get("selected_company")
    company = None
    if selected_company_id and selected_company_id != "all":
        try:
            company = Company.objects.get(pk=int(selected_company_id))
        except (Company.DoesNotExist, ValueError):
            company = None

    # Period bounds (for contract validity check)
    period_start = date(current_year, current_month, 1)
    period_end   = date(current_year, current_month, calendar.monthrange(current_year, current_month)[1])

    # ── Handle POST: save / generate ─────────────────────────────────────
    if request.method == "POST":
        action = request.POST.get("action", "save")
        ctype_post = request.POST.get("ctype_filter", "")
        dept_post  = request.POST.get("dept_filter", "")
        if action == "generate":
            return _generate_payroll_stubs(request, current_year, current_month, company, ctype_post, dept_post)
        return _save_payroll_entries(request, current_year, current_month, company, ctype_post)

    # ── Filters ──────────────────────────────────────────────────────────
    dept_filter    = request.GET.get("dept", "").strip()
    ctype_filter   = request.GET.get("ctype", "").strip()
    status_filter  = request.GET.get("status", "active").strip()

    # ── Load existing entries ─────────────────────────────────────────────
    entry_qs = MonthlyPayrollEntry.objects.filter(
        year=current_year, month=current_month
    ).select_related(
        "employee_id",
        "employee_id__employee_work_info__department_id",
        "employee_id__employee_work_info__job_position_id",
        "trial_contract",
        "official_contract",
        "performance_contract",
        "company",
    )
    if company:
        entry_qs = entry_qs.filter(
            employee_id__employee_work_info__company_id=company
        )
    if dept_filter:
        entry_qs = entry_qs.filter(
            employee_id__employee_work_info__department_id=dept_filter
        )

    # Contract-type filter
    if ctype_filter == "trial":
        entry_qs = entry_qs.filter(trial_contract_id__isnull=False)
    elif ctype_filter == "official":
        entry_qs = entry_qs.filter(official_contract_id__isnull=False)
    elif ctype_filter == "performance":
        entry_qs = entry_qs.filter(performance_contract_id__isnull=False)
    elif ctype_filter in ("horilla", "no_contract"):
        # Both: no HNH contract linked at all
        entry_qs = entry_qs.filter(
            trial_contract_id__isnull=True,
            official_contract_id__isnull=True,
            performance_contract_id__isnull=True,
        )

    bhxh_cap, bhtn_cap = _get_bhxh_caps()
    rows = []
    for e in entry_qs:
        wi   = getattr(e.employee_id, "employee_work_info", None)
        dept = wi.department_id if wi else None
        pos  = wi.job_position_id if wi else None
        validity = _contract_validity(e, period_start, period_end)
        formulas = _compute_entry_formulas(e, bhxh_cap, bhtn_cap)
        rows.append({
            "entry":    e,
            "employee": e.employee_id,
            "dept":     dept,
            "pos":      pos,
            "validity": validity,
            "f":        formulas,
        })

    if status_filter:
        rows = [r for r in rows if r["validity"].get("contract_status") == status_filter]

    warn_count = sum(1 for r in rows if not r["validity"]["contract_ok"])

    # Totals
    def _sum(key):
        return sum(r["f"][key] for r in rows)

    totals = {k: _sum(k) for k in ("J","K","O","T","V","W","X","AB","AC","AD","AE","AF","AH","AI","AK")}
    totals["G"]  = sum(int(r["entry"].lcb_bhxh)     for r in rows)
    totals["H"]  = sum(int(r["entry"].total_gross)   for r in rows)
    totals["L"]  = sum(int(r["entry"].pc_travel)     for r in rows)
    totals["Y"]  = sum(int(r["entry"].incentive)     for r in rows)
    totals["Z"]  = sum(int(r["entry"].bonus)         for r in rows)
    totals["AA"] = sum(int(r["entry"].other_adjust)  for r in rows)
    totals["AJ"] = sum(int(r["entry"].tam_ung)       for r in rows)

    departments = Department.objects.order_by("department")
    month_vn = ["", "Một", "Hai", "Ba", "Bốn", "Năm", "Sáu", "Bảy", "Tám", "Chín", "Mười", "Mười Một", "Mười Hai"][current_month]

    return render(request, "payroll/contracts_hnh/payroll_overview.html", {
        "rows":                rows,
        "totals":              totals,
        "departments":         departments,
        "dept_filter":         dept_filter,
        "ctype_filter":        ctype_filter,
        "status_filter":       status_filter,
        "contract_type_choices":   _CONTRACT_TYPE_CHOICES,
        "contract_status_choices": _CONTRACT_STATUS_CHOICES,
        "warn_count":          warn_count,
        "current_month":       current_month,
        "current_year":        current_year,
        "month_vn":            month_vn,
        "company":             company,
        "has_entries":         bool(rows),
        "bhxh_cap":            int(bhxh_cap),
        "bhtn_cap":            int(bhtn_cap),
        "months":              list(range(1, 13)),
        "years":               list(range(today.year - 2, today.year + 3)),
    })


def _generate_payroll_stubs(request, year: int, month: int, company, ctype_filter: str = "", dept_filter: str = ""):
    """Generate MonthlyPayrollEntry rows from active contracts."""
    period_start = date(year, month, 1)
    period_end   = date(year, month, calendar.monthrange(year, month)[1])

    def _active_hnh(qs):
        q = qs.filter(
            contract_status="active",
            contract_start_date__lte=period_end,
        ).filter(
            models.Q(contract_end_date__isnull=True) |
            models.Q(contract_end_date__gte=period_start)
        ).select_related("employee_id").prefetch_related("allowances")
        if company:
            q = q.filter(employee_id__employee_work_info__company_id=company)
        if dept_filter:
            q = q.filter(employee_id__employee_work_info__department_id=dept_filter)
        return q

    def _active_horilla():
        q = HorillaContract.objects.filter(
            contract_status="active",
            contract_start_date__lte=period_end,
        ).filter(
            models.Q(contract_end_date__isnull=True) |
            models.Q(contract_end_date__gte=period_start)
        ).select_related("employee_id")
        if company:
            q = q.filter(employee_id__employee_work_info__company_id=company)
        if dept_filter:
            q = q.filter(employee_id__employee_work_info__department_id=dept_filter)
        return q

    created = 0
    skipped = 0
    warnings = []

    # HNH contract types
    if ctype_filter in ("", "trial"):
        for c in _active_hnh(TrialContract.objects):
            created, skipped = _try_create_stub(c, year, month, company, created, skipped)
    if ctype_filter in ("", "official"):
        for c in _active_hnh(OfficialContract.objects):
            created, skipped = _try_create_stub(c, year, month, company, created, skipped)
    if ctype_filter in ("", "performance"):
        for c in _active_hnh(PerformanceContract.objects):
            created, skipped = _try_create_stub(c, year, month, company, created, skipped)

    # Horilla native contracts
    if ctype_filter in ("", "horilla"):
        hnh_employee_ids = set()
        for Model in (TrialContract, OfficialContract, PerformanceContract):
            hnh_employee_ids.update(
                Model.objects.filter(
                    contract_status="active",
                    contract_start_date__lte=period_end,
                ).filter(
                    models.Q(contract_end_date__isnull=True) |
                    models.Q(contract_end_date__gte=period_start)
                ).values_list("employee_id_id", flat=True)
            )
        for hc in _active_horilla():
            if hc.employee_id_id in hnh_employee_ids:
                continue
            if MonthlyPayrollEntry.objects.filter(
                employee_id=hc.employee_id, year=year, month=month
            ).exists():
                skipped += 1
                continue
            stub = _build_entry_stub_horilla(hc, year, month, company)
            stub.save()
            created += 1
            if hc.wage is not None and float(hc.wage) == 0:
                warnings.append(f"{hc.employee_id}: lương HĐ Horilla = 0")

    type_label = dict(_CONTRACT_TYPE_CHOICES).get(ctype_filter, "Tất cả")
    dept_label = ""
    if dept_filter:
        dept_obj = Department.objects.filter(pk=dept_filter).first()
        dept_label = f" — {dept_obj.department}" if dept_obj else ""
    msg = f"[{type_label}{dept_label}] Đã tạo {created} dòng bảng lương. Bỏ qua {skipped} nhân viên đã có."
    if warnings:
        msg += f" Cảnh báo: {'; '.join(warnings[:5])}"
    messages.success(request, msg)
    params = f"month={month}&year={year}"
    if ctype_filter:
        params += f"&ctype={ctype_filter}"
    if dept_filter:
        params += f"&dept={dept_filter}"
    return redirect(f"{request.path}?{params}")


def _try_create_stub(contract, year, month, company, created, skipped):
    if MonthlyPayrollEntry.objects.filter(
        employee_id=contract.employee_id, year=year, month=month
    ).exists():
        return created, skipped + 1
    stub = _build_entry_stub(contract, year, month, company)
    stub.save()
    return created + 1, skipped


def _build_entry_stub_horilla(contract: "HorillaContract", year: int, month: int, company=None) -> MonthlyPayrollEntry:
    """Build an unsaved MonthlyPayrollEntry from a Horilla native Contract.

    Horilla Contract only has wage (Basic Salary). G = H = wage.
    """
    G = Decimal(str(contract.wage or 0))
    H = G

    npt_count = EmployeeDependent.objects.filter(
        employee=contract.employee_id, status="approved"
    ).count()

    std_days = _std_working_days(year, month)

    return MonthlyPayrollEntry(
        employee_id=contract.employee_id,
        year=year,
        month=month,
        company=company,
        standard_days=Decimal(str(std_days)),
        actual_days=_actual_cong(contract.employee_id, year, month),
        lcb_bhxh=G,
        total_gross=H,
        npt=npt_count,
        night_shift_rate=_NIGHT_SHIFT_RATE_DEFAULT,
    )


def _save_payroll_entries(request, year: int, month: int, company, ctype_filter: str = ""):
    """Bulk-update MonthlyPayrollEntry from POST data."""
    entry_ids = request.POST.getlist("entry_id")
    updated = 0
    for eid in entry_ids:
        try:
            e = MonthlyPayrollEntry.objects.get(pk=int(eid), year=year, month=month)
        except (MonthlyPayrollEntry.DoesNotExist, ValueError):
            continue

        def _dec(field, default="0"):
            try:
                return Decimal(request.POST.get(f"{field}_{eid}", default) or default)
            except Exception:
                return Decimal(default)
        def _int(field, default=0):
            try:
                return int(request.POST.get(f"{field}_{eid}", default) or default)
            except Exception:
                return default

        e.standard_days    = _dec("e", str(e.standard_days))
        e.actual_days      = _dec("f", str(e.actual_days))
        e.lcb_bhxh         = _dec("g", str(e.lcb_bhxh))
        e.total_gross      = _dec("h", str(e.total_gross))
        e.pc_chuc_vu       = _dec("i", str(e.pc_chuc_vu))
        e.pc_travel        = _dec("l", str(e.pc_travel))
        e.night_shifts     = _dec("m", "0")
        e.night_shift_rate = _dec("n", str(e.night_shift_rate))
        e.ot_normal        = _dec("p", "0")
        e.ot_weekend       = _dec("q", "0")
        e.ot_holiday       = _dec("r", "0")
        e.kpi_pct          = _dec("u", str(e.kpi_pct))
        e.incentive        = _dec("y", "0")
        e.bonus            = _dec("z", "0")
        e.other_adjust     = _dec("aa", "0")
        e.npt              = _int("ag", e.npt)
        e.tam_ung          = _dec("aj", "0")
        e.notes            = request.POST.get(f"notes_{eid}", "").strip()
        e.save()
        updated += 1

    messages.success(request, f"Đã lưu {updated} dòng bảng lương.")
    dept  = request.POST.get("dept_filter", "")
    ctype = request.POST.get("ctype_filter", ctype_filter)
    params = f"month={month}&year={year}"
    if dept:
        params += f"&dept={dept}"
    if ctype:
        params += f"&ctype={ctype}"
    return redirect(f"{request.path}?{params}")


@login_required
def hnh_payroll_export(request):
    """Export monthly payroll to Excel matching the HNH template."""
    today = date.today()
    try:
        month = int(request.GET.get("month", today.month))
        year  = int(request.GET.get("year",  today.year))
    except (ValueError, TypeError):
        month, year = today.month, today.year

    selected_company_id = request.session.get("selected_company")
    company = None
    if selected_company_id and selected_company_id != "all":
        try:
            company = Company.objects.get(pk=int(selected_company_id))
        except (Company.DoesNotExist, ValueError):
            pass

    entry_qs = MonthlyPayrollEntry.objects.filter(year=year, month=month).select_related(
        "employee_id",
        "employee_id__employee_work_info__department_id",
        "employee_id__employee_work_info__job_position_id",
    )
    if company:
        entry_qs = entry_qs.filter(
            employee_id__employee_work_info__company_id=company
        )

    try:
        import openpyxl
        from openpyxl.styles import Alignment, Font, PatternFill, Side, Border
        from openpyxl.utils import get_column_letter
    except ImportError:
        return HttpResponse("openpyxl not installed", status=500)

    bhxh_cap, bhtn_cap = _get_bhxh_caps()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "BANG_LUONG"

    company_name = company.company if company else "CÔNG TY ........................................."
    ws["A1"] = company_name
    ws["A2"] = f"BẢNG TÍNH LƯƠNG THÁNG {month:02d} / {year}"

    # Group headers row 3
    groups = [
        ("A3:D3", "STT / HỌ TÊN / BỘ PHẬN / CHỨC VỤ"),
        ("E3:F3", "NGÀY CÔNG"),
        ("G3:I3", "LƯƠNG HĐ"),
        ("J3:J3", "LCB THỰC LĨNH"),
        ("K3:K3", "LƯƠNG KPI"),
        ("L3:L3", "PC ĐI LẠI"),
        ("M3:O3", "THƯỞNG CA ĐÊM"),
        ("P3:T3", "GIỜ OT"),
        ("U3:V3", "KPI"),
        ("W3:W3", "Gap KPI LHS"),
        ("X3:X3", "THỰC LĨNH"),
        ("Y3:AA3", "THỰC TẾ PHÁT SINH"),
        ("AB3:AB3", "TỔNG THU NHẬP"),
        ("AC3:AF3", "KHẤU TRỪ BHXH"),
        ("AG3:AI3", "TNCN"),
        ("AJ3:AK3", "CHI TRẢ"),
    ]
    for cell_range, label in groups:
        ws.merge_cells(cell_range)
        ws[cell_range.split(":")[0]] = label

    # Column headers row 4
    headers = [
        "STT", "HỌ VÀ TÊN", "BỘ PHẬN", "CHỨC VỤ",
        "Chuẩn (NC)", "Thực tế",
        "LCB đóng BHXH", "Tổng Gross TT", "PC Chức vụ",
        "LCB × (F/E)",
        "LHS Pool",
        "PC Đi lại",
        "Số ca đêm", "Đơn giá ca đêm", "Thưởng ca đêm",
        "OT Thường", "OT Cuối tuần", "OT Ngày lễ", "Đơn giá/giờ", "Tổng OT",
        "% KPI tháng", "KPI thực nhận",
        "Gap KPI LHS",
        "LCB+LHS+OT+PC",
        "Incentive", "Bonus/T13", "Phát sinh khác",
        "Gross thực tế",
        "BHXH (8%)", "BHYT (1.5%)", "BHTN (1%)", "Tổng BH NLĐ",
        "NPT (người)", "Thu nhập chịu thuế", "Thuế TN tạm tính",
        "Tạm ứng", "THỰC LĨNH",
    ]
    for col_idx, h in enumerate(headers, 1):
        ws.cell(row=4, column=col_idx, value=h)

    # Data rows
    for row_num, e in enumerate(entry_qs, 1):
        wi   = getattr(e.employee_id, "employee_work_info", None)
        dept = str(wi.department_id) if wi and wi.department_id else ""
        pos  = str(wi.job_position_id) if wi and wi.job_position_id else ""
        f = _compute_entry_formulas(e, bhxh_cap, bhtn_cap)
        data_row = row_num + 4

        vals = [
            row_num,
            e.employee_id.get_full_name(),
            dept, pos,
            float(e.standard_days), float(e.actual_days),
            int(e.lcb_bhxh), int(e.total_gross), int(e.pc_chuc_vu),
            f["J"], f["K"], int(e.pc_travel),
            float(e.night_shifts), int(e.night_shift_rate), f["O"],
            float(e.ot_normal), float(e.ot_weekend), float(e.ot_holiday),
            f["S"], f["T"],
            float(e.kpi_pct), f["V"],
            f["W"], f["X"],
            int(e.incentive), int(e.bonus), int(e.other_adjust),
            f["AB"],
            f["AC"], f["AD"], f["AE"], f["AF"],
            e.npt, f["AH"], f["AI"],
            int(e.tam_ung), f["AK"],
        ]
        for col_idx, val in enumerate(vals, 1):
            ws.cell(row=data_row, column=col_idx, value=val)

    # Freeze panes
    ws.freeze_panes = "E5"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    resp = HttpResponse(
        buf.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    fname = f"BangLuong_{month:02d}_{year}"
    if company:
        fname += f"_{company.company[:20].replace(' ', '_')}"
    resp["Content-Disposition"] = f'attachment; filename="{fname}.xlsx"'
    return resp


@login_required
def kpi_appendix_delete(request, pk):
    appendix = get_object_or_404(ContractKPIAppendix, pk=pk)
    if appendix.trial_contract_id:
        redirect_view = "trial-contract-detail"
        redirect_pk = appendix.trial_contract_id
    else:
        redirect_view = "performance-contract-detail"
        redirect_pk = appendix.performance_contract_id
    if request.method == "POST":
        appendix.delete()
        messages.success(request, "Đã xóa Phụ lục 1.")
    return redirect(redirect_view, pk=redirect_pk)
