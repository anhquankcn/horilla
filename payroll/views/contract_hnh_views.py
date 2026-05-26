"""
contract_hnh_views.py

HR-facing CRUD views for HNH's 3 contract types:
  - TrialContract / OfficialContract / PerformanceContract
  - ContractKPIAppendix (Phu luc 1, for both Trial and Performance)
"""

import calendar
import json
import logging
from datetime import date

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import models
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render

from base.models import Department, JobPosition
from employee.models import Employee
from payroll.models.bhxh_models import BHXHConfig
from payroll.models.contract_models import (
    ContractKPIAppendix,
    OfficialContract,
    PerformanceContract,
    TrialContract,
)
from payroll.models.models import Allowance, Deduction
from payroll.utils.salary_data import get_annual_salary

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


@login_required
def hnh_payroll_overview(request):
    """Bảng lương tổng công ty — gom 3 loại hợp đồng, filter theo tháng/phòng ban."""
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

    period_start = date(current_year, current_month, 1)
    period_end   = date(current_year, current_month,
                        calendar.monthrange(current_year, current_month)[1])

    def _active_in_period(qs):
        return qs.filter(
            contract_status="active",
            contract_start_date__lte=period_end,
        ).filter(
            models.Q(contract_end_date__isnull=True) |
            models.Q(contract_end_date__gte=period_start)
        )

    common_select = (
        "employee_id__employee_work_info__job_position_id",
        "employee_id__employee_work_info__department_id",
    )

    trial_qs = (
        _active_in_period(TrialContract.objects)
        .select_related(*common_select)
        .prefetch_related("deductions", "kpi_appendices")
    )
    official_qs = (
        _active_in_period(OfficialContract.objects)
        .select_related(*common_select)
        .prefetch_related("deductions")
    )
    perf_qs = (
        _active_in_period(PerformanceContract.objects)
        .select_related(*common_select)
        .prefetch_related("deductions", "kpi_appendices")
    )

    # Employer BH rate từ BHXHConfig (không hardcode)
    bhxh_cfg = BHXHConfig.objects.filter(is_active=True).first()
    if bhxh_cfg:
        er_rate = (
            float(bhxh_cfg.bhxh_rate_er or 17.5)
            + float(bhxh_cfg.bhyt_rate_er or 3.0)
            + float(bhxh_cfg.bhtn_rate_er or 1.0)
        ) / 100
        bhxh_bhyt_cap = float(bhxh_cfg.luong_co_so) * 20
        bhtn_cap       = float(bhxh_cfg.luong_toi_thieu_vung) * 20
    else:
        er_rate       = 0.215
        bhxh_bhyt_cap = 46_800_000.0
        bhtn_cap       = 99_200_000.0

    def _compute_deductions(contract):
        total = 0.0
        detail = {}
        for d in contract.deductions.all():
            amount = contract.wage * float(d.rate) / 100.0
            if d.has_max_limit and d.maximum_amount:
                amount = min(amount, float(d.maximum_amount))
            detail[d.title] = amount
            total += amount
        return total, detail

    def _employer_bh(wage):
        capped_wage = min(wage, bhxh_bhyt_cap)
        return capped_wage * er_rate

    _CONTRACT_LABELS = {
        "TrialContract": "Trial",
        "OfficialContract": "Official",
        "PerformanceContract": "Performance",
    }

    rows = []
    for c in list(trial_qs) + list(official_qs) + list(perf_qs):
        wi   = getattr(c.employee_id, "employee_work_info", None)
        dept = wi.department_id if wi else None
        pos  = wi.job_position_id if wi else None
        total_ded, ded_detail = _compute_deductions(c)

        advance = None
        if hasattr(c, "kpi_appendices"):
            kpi = c.kpi_appendices.filter(year=current_year).first()
            if kpi:
                advance = kpi.monthly_performance_advance

        ctype = type(c).__name__
        rows.append({
            "contract":         c,
            "employee":         c.employee_id,
            "dept":             dept,
            "pos":              pos,
            "contract_type":    _CONTRACT_LABELS.get(ctype, ctype),
            "wage":             c.wage,
            "total_deductions": total_ded,
            "ded_detail":       ded_detail,
            "net_estimated":    c.wage - total_ded,
            "advance":          advance,
        })

    dept_filter = request.GET.get("dept", "").strip()
    type_filter = request.GET.get("type", "").strip()
    if dept_filter:
        rows = [r for r in rows if str(getattr(r["dept"], "pk", "")) == dept_filter]
    if type_filter:
        rows = [r for r in rows if r["contract_type"] == type_filter]

    total_wage         = sum(r["wage"] for r in rows)
    total_employee_ded = sum(r["total_deductions"] for r in rows)
    total_net          = sum(r["net_estimated"] for r in rows)
    total_employer_bh  = sum(_employer_bh(r["wage"]) for r in rows)

    departments = Department.objects.all().order_by("department")

    return render(request, "payroll/contracts_hnh/payroll_overview.html", {
        "rows":                     rows,
        "total_wage":               total_wage,
        "total_employee_deductions": total_employee_ded,
        "total_net":                total_net,
        "total_employer_bhxh":      total_employer_bh,
        "total_employees":          len(rows),
        "departments":              departments,
        "dept_filter":              dept_filter,
        "type_filter":              type_filter,
        "current_month":            current_month,
        "current_year":             current_year,
        "now":                      today,
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
