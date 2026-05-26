"""
contract_hnh_views.py

HR-facing CRUD views for HNH's 3 contract types:
  - TrialContract / OfficialContract / PerformanceContract
  - ContractKPIAppendix (Phu luc 1, only for PerformanceContract)
"""

import logging
from datetime import date

from django.contrib import messages
from django.contrib.auth.decorators import login_required, permission_required
from django.shortcuts import get_object_or_404, redirect, render

from employee.models import Employee
from payroll.models.contract_models import (
    ContractKPIAppendix,
    OfficialContract,
    PerformanceContract,
    TrialContract,
)
from payroll.models.models import Allowance, Deduction

logger = logging.getLogger(__name__)

_PERM = "payroll.add_officialcontract"   # proxy perm for general access check


def _get_allowances_deductions():
    return (
        Allowance.objects.filter(is_active=True).order_by("name"),
        Deduction.objects.filter(is_active=True).order_by("name"),
    )


# ─── Helper: read common base fields from POST ───────────────────────────────

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


# ─── TrialContract ────────────────────────────────────────────────────────────


@login_required
def trial_contract_list(request):
    contracts = TrialContract.objects.select_related("employee_id").order_by(
        "-contract_start_date"
    )
    status_filter = request.GET.get("status", "")
    if status_filter:
        contracts = contracts.filter(contract_status=status_filter)
    return render(
        request,
        "payroll/contracts_hnh/trial/list.html",
        {"contracts": contracts, "status_filter": status_filter},
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
            trial_wage_pct = float(request.POST.get("trial_wage_pct", 85))
        except (ValueError, TypeError):
            trial_wage_pct = 85

        if not errors:
            obj = TrialContract.objects.create(
                employee_id=base["employee"],
                contract_name=base["contract_name"],
                contract_start_date=base["start_str"],
                contract_end_date=base["end_str"] or None,
                wage=base["wage"],
                contract_status=base["contract_status"],
                consent_agreed=base["consent_agreed"],
                consent_date=base["consent_date_str"] or None,
                probation_days=probation_days,
                trial_wage_pct=trial_wage_pct,
            )
            selected_allowances = request.POST.getlist("allowances")
            selected_deductions = request.POST.getlist("deductions")
            obj.allowances.set(selected_allowances)
            obj.deductions.set(selected_deductions)
            messages.success(request, f"Đã tạo hợp đồng UAT PM: {obj.contract_name}")
            return redirect("trial-contract-list")

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
            trial_wage_pct = float(request.POST.get("trial_wage_pct", 85))
        except (ValueError, TypeError):
            trial_wage_pct = 85

        if not errors:
            obj.employee_id = base["employee"]
            obj.contract_name = base["contract_name"]
            obj.contract_start_date = base["start_str"]
            obj.contract_end_date = base["end_str"] or None
            obj.wage = base["wage"]
            obj.contract_status = base["contract_status"]
            obj.consent_agreed = base["consent_agreed"]
            obj.consent_date = base["consent_date_str"] or None
            obj.probation_days = probation_days
            obj.trial_wage_pct = trial_wage_pct
            obj.save()
            obj.allowances.set(request.POST.getlist("allowances"))
            obj.deductions.set(request.POST.getlist("deductions"))
            messages.success(request, "Đã cập nhật hợp đồng UAT PM.")
            return redirect("trial-contract-list")

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


# ─── OfficialContract ─────────────────────────────────────────────────────────


@login_required
def official_contract_list(request):
    contracts = OfficialContract.objects.select_related("employee_id").order_by(
        "-contract_start_date"
    )
    status_filter = request.GET.get("status", "")
    if status_filter:
        contracts = contracts.filter(contract_status=status_filter)
    return render(
        request,
        "payroll/contracts_hnh/official/list.html",
        {"contracts": contracts, "status_filter": status_filter},
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
    contracts = PerformanceContract.objects.select_related("employee_id").prefetch_related(
        "kpi_appendices"
    ).order_by("-contract_start_date")
    status_filter = request.GET.get("status", "")
    if status_filter:
        contracts = contracts.filter(contract_status=status_filter)
    return render(
        request,
        "payroll/contracts_hnh/performance/list.html",
        {"contracts": contracts, "status_filter": status_filter},
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


# ─── ContractKPIAppendix ─────────────────────────────────────────────────────


@login_required
def kpi_appendix_create(request, contract_pk):
    contract = get_object_or_404(PerformanceContract, pk=contract_pk)
    from base.models import JobPosition
    positions = JobPosition.objects.all().order_by("job_position")

    if request.method == "POST":
        errors = {}
        try:
            year = int(request.POST.get("year", date.today().year))
        except (ValueError, TypeError):
            errors["year"] = "Năm không hợp lệ."
            year = date.today().year

        if ContractKPIAppendix.objects.filter(contract=contract, year=year).exists():
            errors["year"] = f"Phụ lục 1 năm {year} đã tồn tại cho hợp đồng này."

        def _flt(name, default):
            try:
                return float(request.POST.get(name, default))
            except (ValueError, TypeError):
                return float(default)

        def _big(name, default):
            try:
                return int(str(request.POST.get(name, default)).replace(",", "").replace(".", ""))
            except (ValueError, TypeError):
                return int(default)

        position_id = request.POST.get("position") or None

        if not errors:
            ContractKPIAppendix.objects.create(
                contract=contract,
                year=year,
                position_id=position_id,
                annual_income_min=_big("annual_income_min", 0),
                annual_income_max=_big("annual_income_max", 0),
                kpi_description=request.POST.get("kpi_description", ""),
                kpi_pct_90_100=_flt("kpi_pct_90_100", 100),
                kpi_pct_75_89=_flt("kpi_pct_75_89", 75),
                kpi_pct_60_74=_flt("kpi_pct_60_74", 50),
                kpi_below_60=_flt("kpi_below_60", 0),
                monthly_performance_advance=_big("monthly_performance_advance", 0),
            )
            messages.success(request, f"Đã thêm Phụ lục 1 năm {year}.")
            return redirect("performance-contract-detail", pk=contract_pk)

        return render(request, "payroll/contracts_hnh/kpi_appendix_form.html", {
            "contract": contract, "positions": positions, "errors": errors, "post": request.POST,
        })

    return render(request, "payroll/contracts_hnh/kpi_appendix_form.html", {
        "contract": contract, "positions": positions,
    })


@login_required
def kpi_appendix_delete(request, pk):
    appendix = get_object_or_404(ContractKPIAppendix, pk=pk)
    contract_pk = appendix.contract_id
    if request.method == "POST":
        appendix.delete()
        messages.success(request, "Đã xóa Phụ lục 1.")
    return redirect("performance-contract-detail", pk=contract_pk)
