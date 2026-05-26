"""
contract_hnh_views.py

HR-facing CRUD views for HNH's 3 contract types:
  - TrialContract / OfficialContract / PerformanceContract
  - ContractKPIAppendix (Phu luc 1, for both Trial and Performance)
"""

import logging
from datetime import date

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import models
from django.shortcuts import get_object_or_404, redirect, render

from base.models import JobPosition
from employee.models import Employee
from payroll.models.contract_models import (
    ContractKPIAppendix,
    OfficialContract,
    PerformanceContract,
    TrialContract,
)
from payroll.models.models import Allowance, Deduction

logger = logging.getLogger(__name__)

_PAGE_SIZE = 50


def _get_allowances_deductions():
    return (
        Allowance.objects.filter(is_active=True).order_by("name"),
        Deduction.objects.filter(is_active=True).order_by("name"),
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


@login_required
def trial_contract_list(request):
    qs = (
        TrialContract.objects
        .select_related("employee_id", "employee_id__employee_work_info__department_id")
        .prefetch_related("kpi_appendices")
        .order_by("-contract_start_date")
    )
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
    return render(
        request,
        "payroll/contracts_hnh/trial/list.html",
        {
            "contracts": page,
            "status_filter": status_filter,
            "search": search,
        },
    )


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
    positions = JobPosition.objects.all().order_by("job_position")

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
            "positions": positions, "errors": errors, "post": request.POST,
        })

    return render(request, "payroll/contracts_hnh/kpi_appendix_form.html", {
        "contract": contract, "contract_type": "trial", "positions": positions,
    })


# ─── OfficialContract ─────────────────────────────────────────────────────────


@login_required
def official_contract_list(request):
    qs = OfficialContract.objects.select_related("employee_id").order_by("-contract_start_date")
    status_filter = request.GET.get("status", "")
    if status_filter:
        qs = qs.filter(contract_status=status_filter)
    return render(
        request,
        "payroll/contracts_hnh/official/list.html",
        {"contracts": qs, "status_filter": status_filter},
    )


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
def official_contract_delete(request, pk):
    obj = get_object_or_404(OfficialContract, pk=pk)
    if request.method == "POST":
        obj.delete()
        messages.success(request, "Đã xóa hợp đồng chính thức.")
    return redirect("official-contract-list")


# ─── PerformanceContract + KPI Appendix ──────────────────────────────────────


@login_required
def performance_contract_list(request):
    qs = (
        PerformanceContract.objects
        .select_related("employee_id")
        .prefetch_related("kpi_appendices")
        .order_by("-contract_start_date")
    )
    status_filter = request.GET.get("status", "")
    if status_filter:
        qs = qs.filter(contract_status=status_filter)
    return render(
        request,
        "payroll/contracts_hnh/performance/list.html",
        {"contracts": qs, "status_filter": status_filter},
    )


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
        PerformanceContract.objects.prefetch_related("kpi_appendices__position"),
        pk=pk,
    )
    return render(
        request,
        "payroll/contracts_hnh/performance/detail.html",
        {"contract": obj, "appendices": obj.kpi_appendices.all()},
    )


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
    positions = JobPosition.objects.all().order_by("job_position")

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
            "positions": positions, "errors": errors, "post": request.POST,
        })

    return render(request, "payroll/contracts_hnh/kpi_appendix_form.html", {
        "contract": contract, "contract_type": "performance", "positions": positions,
    })


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
