"""
pit_views.py

Vietnamese PIT (Thuế TNCN) HR-facing views.
"""

import csv
import logging

from django.contrib import messages
from django.contrib.auth.decorators import login_required, permission_required
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from employee.models import Employee
from payroll.models.bhxh_models import BHXHContribution
from payroll.models.dependent import EmployeeDependent
from payroll.models.pit_models import PITCalculation, PITConfig, calculate_pit

logger = logging.getLogger(__name__)


def _get_active_config(company=None):
    qs = PITConfig.objects.filter(is_active=True)
    if company:
        qs = qs.filter(company_id=company)
    return qs.order_by("-effective_from").first()


# ─── Config ─────────────────────────────────────────────────────────────────


@login_required
@permission_required("payroll.change_pitconfig")
def pit_config_list(request):
    configs = PITConfig.objects.all().order_by("-effective_from")
    from payroll.models.pit_models import VN_TAX_BRACKETS
    return render(request, "payroll/pit/config_list.html", {
        "configs": configs,
        "brackets": VN_TAX_BRACKETS,
    })


@login_required
@permission_required("payroll.change_pitconfig")
def pit_config_create(request):
    from base.models import Company
    companies = Company.objects.all()

    if request.method == "POST":
        errors = {}
        effective_from_str = request.POST.get("effective_from", "").strip()
        if not effective_from_str:
            errors["effective_from"] = "Vui lòng nhập ngày hiệu lực."

        def _int(name, default):
            try:
                return int(str(request.POST.get(name, default)).replace(",", "").replace(".", ""))
            except (ValueError, TypeError):
                errors[name] = "Giá trị không hợp lệ."
                return int(default)

        personal_deduction = _int("personal_deduction", 15_500_000)
        npt_deduction = _int("npt_deduction", 6_200_000)
        note = request.POST.get("note", "").strip()
        is_active = request.POST.get("is_active") == "on"
        company_id_val = request.POST.get("company_id") or None

        if not errors:
            cfg = PITConfig(
                effective_from=effective_from_str,
                personal_deduction=personal_deduction,
                npt_deduction=npt_deduction,
                note=note,
                is_active=is_active,
            )
            if company_id_val:
                from base.models import Company as C
                try:
                    cfg.company_id = C.objects.get(pk=company_id_val)
                except C.DoesNotExist:
                    pass
            cfg.save()
            messages.success(request, "Đã tạo cấu hình thuế TNCN.")
            return redirect("pit-config-list")

        return render(request, "payroll/pit/config_form.html", {
            "companies": companies, "errors": errors,
            "form_data": request.POST, "action": "Tạo mới",
        })

    return render(request, "payroll/pit/config_form.html", {
        "companies": companies, "errors": {},
        "form_data": {
            "personal_deduction": "15500000",
            "npt_deduction": "6200000",
            "effective_from": "2026-01-01",
            "is_active": "on",
        },
        "action": "Tạo mới",
    })


@login_required
@permission_required("payroll.change_pitconfig")
def pit_config_update(request, config_id):
    cfg = get_object_or_404(PITConfig, pk=config_id)
    from base.models import Company
    companies = Company.objects.all()

    if request.method == "POST":
        errors = {}
        effective_from_str = request.POST.get("effective_from", "").strip()
        if not effective_from_str:
            errors["effective_from"] = "Vui lòng nhập ngày hiệu lực."

        def _int(name, default):
            try:
                return int(str(request.POST.get(name, default)).replace(",", "").replace(".", ""))
            except (ValueError, TypeError):
                errors[name] = "Giá trị không hợp lệ."
                return int(default)

        cfg.effective_from = effective_from_str
        cfg.personal_deduction = _int("personal_deduction", cfg.personal_deduction)
        cfg.npt_deduction = _int("npt_deduction", cfg.npt_deduction)
        cfg.note = request.POST.get("note", "").strip()
        cfg.is_active = request.POST.get("is_active") == "on"

        if not errors:
            cfg.save()
            messages.success(request, "Đã cập nhật cấu hình thuế TNCN.")
            return redirect("pit-config-list")

        return render(request, "payroll/pit/config_form.html", {
            "companies": companies, "errors": errors, "cfg": cfg,
            "form_data": request.POST, "action": "Cập nhật",
        })

    return render(request, "payroll/pit/config_form.html", {
        "companies": companies, "errors": {}, "cfg": cfg,
        "form_data": {
            "personal_deduction": cfg.personal_deduction,
            "npt_deduction": cfg.npt_deduction,
            "effective_from": cfg.effective_from,
            "note": cfg.note,
            "is_active": "on" if cfg.is_active else "",
            "company_id": cfg.company_id_id or "",
        },
        "action": "Cập nhật",
    })


# ─── Compute ────────────────────────────────────────────────────────────────


def _gross_income_for_employee(employee, year, month):
    """
    Determine gross taxable income for PIT purposes.
    Priority: payslip gross_pay for the period → contract wage.
    """
    from payroll.models.models import Payslip
    import datetime
    period_start = datetime.date(year, month, 1)
    # Find any payslip covering this month
    payslip = (
        Payslip.objects.filter(
            employee_id=employee,
            start_date__year=year,
            start_date__month=month,
        )
        .order_by("-id")
        .first()
    )
    if payslip and payslip.gross_pay:
        return int(payslip.gross_pay), payslip

    # Fallback: contract wage
    contract = (
        employee.contract_set.filter(contract_status="active")
        .order_by("-id")
        .first()
    )
    wage = int(contract.wage) if contract and contract.wage else 0
    return wage, None


@login_required
@permission_required("payroll.change_pitconfig")
def pit_compute_month(request):
    if request.method != "POST":
        return redirect("pit-report")

    try:
        year = int(request.POST.get("year", timezone.localdate().year))
        month = int(request.POST.get("month", timezone.localdate().month))
    except (ValueError, TypeError):
        messages.error(request, "Tháng/năm không hợp lệ.")
        return redirect("pit-report")

    config = _get_active_config()
    if not config:
        messages.error(request, "Chưa có cấu hình thuế TNCN. Vui lòng tạo cấu hình trước.")
        return redirect("pit-config-list")

    from django.db.models import Q

    active_employees = Employee.objects.filter(
        contract_set__contract_status="active"
    ).distinct()

    import datetime
    period_date = datetime.date(year, month, 1)

    created = updated = 0
    for employee in active_employees:
        gross_income, payslip = _gross_income_for_employee(employee, year, month)

        # BHXH NLĐ for this month (from BHXHContribution if computed)
        bhxh_rec = BHXHContribution.objects.filter(
            employee=employee, period_year=year, period_month=month
        ).first()
        bhxh_ee = bhxh_rec.total_ee if bhxh_rec else 0

        # Approved NPT count for this month
        npt_count = EmployeeDependent.objects.filter(
            employee=employee,
            status="approved",
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=period_date)
        ).filter(start_date__lte=period_date).count()

        data = config.compute_for_employee(employee, gross_income, bhxh_ee, npt_count)

        obj, is_new = PITCalculation.objects.update_or_create(
            employee=employee,
            period_year=year,
            period_month=month,
            defaults={
                "config": config,
                "payslip": payslip,
                **data,
            },
        )
        if is_new:
            created += 1
        else:
            updated += 1

    messages.success(
        request,
        f"Da tinh Thue TNCN thang {month:02d}/{year}: {created} moi, {updated} cap nhat.",
    )
    return redirect(f"/payroll/pit/report/?year={year}&month={month}")


# ─── Report ─────────────────────────────────────────────────────────────────


@login_required
@permission_required("payroll.change_pitconfig")
def pit_report(request):
    today = timezone.localdate()
    try:
        year = int(request.GET.get("year", today.year))
        month = int(request.GET.get("month", today.month))
        if not (1 <= month <= 12):
            raise ValueError
    except (ValueError, TypeError):
        year, month = today.year, today.month

    calculations = (
        PITCalculation.objects.filter(period_year=year, period_month=month)
        .select_related("employee", "config")
        .order_by("employee__employee_first_name")
    )

    totals = {
        "gross_income": sum(c.gross_income for c in calculations),
        "bhxh_deduction": sum(c.bhxh_deduction for c in calculations),
        "personal_deduction": sum(c.personal_deduction for c in calculations),
        "npt_deduction_total": sum(c.npt_deduction_total for c in calculations),
        "total_deductions": sum(c.total_deductions for c in calculations),
        "taxable_income": sum(c.taxable_income for c in calculations),
        "pit_amount": sum(c.pit_amount for c in calculations),
    }

    months = [(m, f"Thang {m:02d}") for m in range(1, 13)]
    years = list(range(today.year - 2, today.year + 2))

    return render(request, "payroll/pit/report.html", {
        "calculations": calculations,
        "totals": totals,
        "year": year,
        "month": month,
        "months": months,
        "years": years,
        "period_label": f"Thang {month:02d}/{year}",
    })


@login_required
@permission_required("payroll.change_pitconfig")
def pit_export_csv(request):
    try:
        year = int(request.GET.get("year", timezone.localdate().year))
        month = int(request.GET.get("month", timezone.localdate().month))
    except (ValueError, TypeError):
        year, month = timezone.localdate().year, timezone.localdate().month

    response = HttpResponse(content_type="text/csv; charset=utf-8-sig")
    filename = f"tncn_{year}_{month:02d}.csv"
    response["Content-Disposition"] = f'attachment; filename="{filename}"'

    writer = csv.writer(response)
    writer.writerow([
        "STT", "Nhan vien",
        "Thu nhap chiu thue", "Tru BHXH NLD", "Giam tru ban than",
        "So NPT", "Giam tru NPT", "Tong giam tru",
        "Thu nhap tinh thue", "Thue TNCN",
    ])

    qs = (
        PITCalculation.objects.filter(period_year=year, period_month=month)
        .select_related("employee")
        .order_by("employee__employee_first_name")
    )

    for i, c in enumerate(qs, 1):
        writer.writerow([
            i,
            str(c.employee),
            c.gross_income,
            c.bhxh_deduction,
            c.personal_deduction,
            c.npt_count,
            c.npt_deduction_total,
            c.total_deductions,
            c.taxable_income,
            c.pit_amount,
        ])

    return response


# ─── Employee detail ─────────────────────────────────────────────────────────


@login_required
@permission_required("payroll.change_pitconfig")
def pit_employee_detail(request, employee_id, year, month):
    employee = get_object_or_404(Employee, pk=employee_id)
    calc = PITCalculation.objects.filter(
        employee=employee, period_year=year, period_month=month
    ).first()

    from payroll.models.pit_models import VN_TAX_BRACKETS
    bracket_breakdown = []
    if calc and calc.taxable_income > 0:
        prev = 0
        for upper, rate in VN_TAX_BRACKETS:
            if prev >= calc.taxable_income:
                break
            top = min(calc.taxable_income, upper) if upper else calc.taxable_income
            income_in_bracket = top - prev
            if income_in_bracket <= 0:
                break
            tax_in_bracket = int(income_in_bracket * rate / 100)
            bracket_breakdown.append({
                "rate": rate,
                "lower": prev,
                "upper": upper,
                "income_in_bracket": income_in_bracket,
                "tax_in_bracket": tax_in_bracket,
            })
            prev = top

    return render(request, "payroll/pit/employee_detail.html", {
        "employee": employee,
        "calc": calc,
        "bracket_breakdown": bracket_breakdown,
        "year": year,
        "month": month,
    })
