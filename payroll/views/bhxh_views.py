"""
bhxh_views.py

HR-facing views for BHXH/BHYT/BHTN configuration and reporting.
"""

import csv
import logging
from datetime import date

from django.contrib import messages
from django.contrib.auth.decorators import login_required, permission_required
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from employee.models import Employee
from payroll.models.bhxh_models import BHXHConfig, BHXHContribution, EmployeeBHXHInfo

logger = logging.getLogger(__name__)


def _get_active_config(company=None):
    qs = BHXHConfig.objects.filter(is_active=True)
    if company:
        qs = qs.filter(company_id=company)
    return qs.order_by("-effective_from").first()


# ─── Config ─────────────────────────────────────────────────────────────────


@login_required
@permission_required("payroll.change_bhxhconfig")
def bhxh_config_list(request):
    configs = BHXHConfig.objects.all().order_by("-effective_from")
    return render(
        request,
        "payroll/bhxh/config_list.html",
        {"configs": configs},
    )


@login_required
@permission_required("payroll.change_bhxhconfig")
def bhxh_config_create(request):
    from base.models import Company

    companies = Company.objects.all()

    if request.method == "POST":
        errors = {}
        effective_from_str = request.POST.get("effective_from", "").strip()
        if not effective_from_str:
            errors["effective_from"] = "Vui lòng nhập ngày hiệu lực."

        def _dec(name, default):
            try:
                return float(request.POST.get(name, default))
            except (ValueError, TypeError):
                errors[name] = "Giá trị không hợp lệ."
                return float(default)

        def _int(name, default):
            try:
                return int(str(request.POST.get(name, default)).replace(",", "").replace(".", ""))
            except (ValueError, TypeError):
                errors[name] = "Giá trị không hợp lệ."
                return int(default)

        bhxh_rate_ee = _dec("bhxh_rate_ee", 8.0)
        bhyt_rate_ee = _dec("bhyt_rate_ee", 1.5)
        bhtn_rate_ee = _dec("bhtn_rate_ee", 1.0)
        bhxh_rate_er = _dec("bhxh_rate_er", 17.5)
        bhyt_rate_er = _dec("bhyt_rate_er", 3.0)
        bhtn_rate_er = _dec("bhtn_rate_er", 1.0)
        kpcd_rate_er = _dec("kpcd_rate_er", 2.0)
        luong_co_so = _int("luong_co_so", 2_340_000)
        luong_toi_thieu_vung = _int("luong_toi_thieu_vung", 4_960_000)
        company_id_val = request.POST.get("company_id") or None
        note = request.POST.get("note", "").strip()
        is_active = request.POST.get("is_active") == "on"

        if not errors:
            cfg = BHXHConfig(
                effective_from=effective_from_str,
                bhxh_rate_ee=bhxh_rate_ee,
                bhyt_rate_ee=bhyt_rate_ee,
                bhtn_rate_ee=bhtn_rate_ee,
                bhxh_rate_er=bhxh_rate_er,
                bhyt_rate_er=bhyt_rate_er,
                bhtn_rate_er=bhtn_rate_er,
                kpcd_rate_er=kpcd_rate_er,
                luong_co_so=luong_co_so,
                luong_toi_thieu_vung=luong_toi_thieu_vung,
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
            messages.success(request, "Đã tạo cấu hình BHXH mới.")
            return redirect("bhxh-config-list")

        return render(
            request,
            "payroll/bhxh/config_form.html",
            {
                "companies": companies,
                "errors": errors,
                "form_data": request.POST,
                "action": "Tạo mới",
            },
        )

    return render(
        request,
        "payroll/bhxh/config_form.html",
        {
            "companies": companies,
            "errors": {},
            "form_data": {
                "bhxh_rate_ee": "8.00",
                "bhyt_rate_ee": "1.50",
                "bhtn_rate_ee": "1.00",
                "bhxh_rate_er": "17.50",
                "bhyt_rate_er": "3.00",
                "bhtn_rate_er": "1.00",
                "kpcd_rate_er": "2.00",
                "luong_co_so": "2340000",
                "luong_toi_thieu_vung": "4960000",
                "effective_from": "2024-07-01",
                "is_active": "on",
            },
            "action": "Tạo mới",
        },
    )


@login_required
@permission_required("payroll.change_bhxhconfig")
def bhxh_config_update(request, config_id):
    cfg = get_object_or_404(BHXHConfig, pk=config_id)
    from base.models import Company

    companies = Company.objects.all()

    if request.method == "POST":
        errors = {}
        effective_from_str = request.POST.get("effective_from", "").strip()
        if not effective_from_str:
            errors["effective_from"] = "Vui lòng nhập ngày hiệu lực."

        def _dec(name, default):
            try:
                return float(request.POST.get(name, default))
            except (ValueError, TypeError):
                errors[name] = "Giá trị không hợp lệ."
                return float(default)

        def _int(name, default):
            try:
                return int(str(request.POST.get(name, default)).replace(",", "").replace(".", ""))
            except (ValueError, TypeError):
                errors[name] = "Giá trị không hợp lệ."
                return int(default)

        cfg.effective_from = effective_from_str
        cfg.bhxh_rate_ee = _dec("bhxh_rate_ee", cfg.bhxh_rate_ee)
        cfg.bhyt_rate_ee = _dec("bhyt_rate_ee", cfg.bhyt_rate_ee)
        cfg.bhtn_rate_ee = _dec("bhtn_rate_ee", cfg.bhtn_rate_ee)
        cfg.bhxh_rate_er = _dec("bhxh_rate_er", cfg.bhxh_rate_er)
        cfg.bhyt_rate_er = _dec("bhyt_rate_er", cfg.bhyt_rate_er)
        cfg.bhtn_rate_er = _dec("bhtn_rate_er", cfg.bhtn_rate_er)
        cfg.kpcd_rate_er = _dec("kpcd_rate_er", cfg.kpcd_rate_er)
        cfg.luong_co_so = _int("luong_co_so", cfg.luong_co_so)
        cfg.luong_toi_thieu_vung = _int("luong_toi_thieu_vung", cfg.luong_toi_thieu_vung)
        cfg.note = request.POST.get("note", "").strip()
        cfg.is_active = request.POST.get("is_active") == "on"
        company_id_val = request.POST.get("company_id") or None
        if company_id_val:
            from base.models import Company as C
            try:
                cfg.company_id = C.objects.get(pk=company_id_val)
            except C.DoesNotExist:
                cfg.company_id = None
        else:
            cfg.company_id = None

        if not errors:
            cfg.save()
            messages.success(request, "Đã cập nhật cấu hình BHXH.")
            return redirect("bhxh-config-list")

        return render(
            request,
            "payroll/bhxh/config_form.html",
            {"companies": companies, "errors": errors, "form_data": request.POST, "cfg": cfg, "action": "Cập nhật"},
        )

    return render(
        request,
        "payroll/bhxh/config_form.html",
        {
            "companies": companies,
            "errors": {},
            "cfg": cfg,
            "form_data": {
                "bhxh_rate_ee": cfg.bhxh_rate_ee,
                "bhyt_rate_ee": cfg.bhyt_rate_ee,
                "bhtn_rate_ee": cfg.bhtn_rate_ee,
                "bhxh_rate_er": cfg.bhxh_rate_er,
                "bhyt_rate_er": cfg.bhyt_rate_er,
                "bhtn_rate_er": cfg.bhtn_rate_er,
                "kpcd_rate_er": cfg.kpcd_rate_er,
                "luong_co_so": cfg.luong_co_so,
                "luong_toi_thieu_vung": cfg.luong_toi_thieu_vung,
                "effective_from": cfg.effective_from,
                "note": cfg.note,
                "is_active": "on" if cfg.is_active else "",
                "company_id": cfg.company_id_id or "",
            },
            "action": "Cập nhật",
        },
    )


# ─── Employee BHXH Info ──────────────────────────────────────────────────────


@login_required
@permission_required("payroll.change_bhxhconfig")
def bhxh_employee_info(request, employee_id):
    employee = get_object_or_404(Employee, pk=employee_id)
    info, _ = EmployeeBHXHInfo.objects.get_or_create(employee=employee)

    if request.method == "POST":
        luong_dong_bh_raw = request.POST.get("luong_dong_bh", "").strip().replace(",", "")
        info.luong_dong_bh = int(luong_dong_bh_raw) if luong_dong_bh_raw else None
        info.so_bhxh = request.POST.get("so_bhxh", "").strip()
        info.ma_bhyt = request.POST.get("ma_bhyt", "").strip()
        info.is_exempt = request.POST.get("is_exempt") == "on"
        info.exempt_reason = request.POST.get("exempt_reason", "").strip()
        info.save()
        messages.success(request, f"Đã cập nhật thông tin BHXH cho {employee}.")
        if request.headers.get("HX-Request"):
            response = HttpResponse()
            response["HX-Redirect"] = f"/payroll/bhxh/report/"
            return response
        return redirect("bhxh-report")

    return render(
        request,
        "payroll/bhxh/employee_info_form.html",
        {"employee": employee, "info": info},
    )


# ─── Monthly Report ──────────────────────────────────────────────────────────


@login_required
@permission_required("payroll.change_bhxhconfig")
def bhxh_report(request):
    today = timezone.localdate()
    try:
        year = int(request.GET.get("year", today.year))
        month = int(request.GET.get("month", today.month))
        if not (1 <= month <= 12):
            raise ValueError
    except (ValueError, TypeError):
        year, month = today.year, today.month

    contributions = (
        BHXHContribution.objects.filter(period_year=year, period_month=month)
        .select_related("employee", "config")
        .order_by("employee__employee_first_name")
    )

    totals = {
        "luong_dong_bh": sum(c.luong_dong_bh for c in contributions),
        "bhxh_ee": sum(c.bhxh_ee for c in contributions),
        "bhyt_ee": sum(c.bhyt_ee for c in contributions),
        "bhtn_ee": sum(c.bhtn_ee for c in contributions),
        "total_ee": sum(c.total_ee for c in contributions),
        "bhxh_er": sum(c.bhxh_er for c in contributions),
        "bhyt_er": sum(c.bhyt_er for c in contributions),
        "bhtn_er": sum(c.bhtn_er for c in contributions),
        "kpcd_er": sum(c.kpcd_er for c in contributions),
        "total_er": sum(c.total_er for c in contributions),
    }

    months = [(m, f"Tháng {m:02d}") for m in range(1, 13)]
    years = list(range(today.year - 2, today.year + 2))

    return render(
        request,
        "payroll/bhxh/report.html",
        {
            "contributions": contributions,
            "totals": totals,
            "year": year,
            "month": month,
            "months": months,
            "years": years,
            "period_label": f"Tháng {month:02d}/{year}",
        },
    )


@login_required
@permission_required("payroll.change_bhxhconfig")
def bhxh_compute_month(request):
    """Manually trigger BHXH computation for a given month."""
    if request.method != "POST":
        return redirect("bhxh-report")

    try:
        year = int(request.POST.get("year", timezone.localdate().year))
        month = int(request.POST.get("month", timezone.localdate().month))
    except (ValueError, TypeError):
        messages.error(request, "Tháng/năm không hợp lệ.")
        return redirect("bhxh-report")

    config = _get_active_config()
    if not config:
        messages.error(request, "Chưa có cấu hình BHXH. Vui lòng tạo cấu hình trước.")
        return redirect("bhxh-config-list")

    # Compute for all employees with active contracts
    from payroll.models.models import Contract

    active_employees = Employee.objects.filter(
        contract_set__contract_status="active"
    ).distinct()

    created = updated = 0
    for employee in active_employees:
        data = config.compute_for_employee(employee)
        obj, is_new = BHXHContribution.objects.update_or_create(
            employee=employee,
            period_year=year,
            period_month=month,
            defaults={
                "config": config,
                **data,
            },
        )
        if is_new:
            created += 1
        else:
            updated += 1

    messages.success(
        request,
        f"Đã tính BHXH tháng {month:02d}/{year}: {created} mới, {updated} cập nhật.",
    )
    return redirect(f"/payroll/bhxh/report/?year={year}&month={month}")


@login_required
@permission_required("payroll.change_bhxhconfig")
def bhxh_export_csv(request):
    try:
        year = int(request.GET.get("year", timezone.localdate().year))
        month = int(request.GET.get("month", timezone.localdate().month))
    except (ValueError, TypeError):
        year, month = timezone.localdate().year, timezone.localdate().month

    response = HttpResponse(content_type="text/csv; charset=utf-8-sig")
    filename = f"bhxh_{year}_{month:02d}.csv"
    response["Content-Disposition"] = f'attachment; filename="{filename}"'

    writer = csv.writer(response)
    writer.writerow([
        "STT", "Nhân viên", "Số sổ BHXH", "Mã thẻ BHYT",
        "Lương đóng BHXH/BHYT", "Lương đóng BHTN",
        "BHXH NLĐ", "BHYT NLĐ", "BHTN NLĐ", "Tổng BH NLĐ",
        "BHXH NSDLĐ", "BHYT NSDLĐ", "BHTN NSDLĐ", "KPCĐ NSDLĐ", "Tổng BH NSDLĐ",
        "Tổng cộng (NLĐ+NSDLĐ)",
    ])

    qs = (
        BHXHContribution.objects.filter(period_year=year, period_month=month)
        .select_related("employee", "employee__bhxh_info")
        .order_by("employee__employee_first_name")
    )

    for i, c in enumerate(qs, 1):
        bhxh_info = getattr(c.employee, "bhxh_info", None)
        writer.writerow([
            i,
            str(c.employee),
            getattr(bhxh_info, "so_bhxh", "") or "",
            getattr(bhxh_info, "ma_bhyt", "") or "",
            c.luong_dong_bh,
            c.luong_dong_bhtn,
            c.bhxh_ee,
            c.bhyt_ee,
            c.bhtn_ee,
            c.total_ee,
            c.bhxh_er,
            c.bhyt_er,
            c.bhtn_er,
            c.kpcd_er,
            c.total_er,
            c.total_ee + c.total_er,
        ])

    return response
