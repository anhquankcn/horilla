"""
employee/work_level_views.py

Views for the Work Level (Cấp bậc nội bộ) feature.
"""

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render

from employee.models import Employee, WorkLevel


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _suggest_level(employee):
    """Return the best-matching WorkLevel based on annual salary."""
    wi = getattr(employee, "employee_work_info", None)
    if not wi or not wi.basic_salary:
        return None
    annual = int(wi.basic_salary) * 12
    return (
        WorkLevel.objects.filter(income_min__lte=annual, income_max__gte=annual)
        .order_by("level_number")
        .first()
    )


# ─── Employee Profile Tab ───────────────────────────────────────────────────────

@login_required
def work_level_tab(request, pk):
    employee = get_object_or_404(Employee, pk=pk)
    levels = WorkLevel.objects.all()
    suggested = _suggest_level(employee)
    return render(
        request,
        "tabs/work_level_tab.html",
        {"employee": employee, "levels": levels, "suggested": suggested},
    )


def _htmx_refresh_or_redirect(request):
    """Return HX-Refresh for HTMX requests, redirect to referer otherwise."""
    if request.headers.get("HX-Request"):
        response = HttpResponse()
        response["HX-Refresh"] = "true"
        return response
    return redirect(request.META.get("HTTP_REFERER") or "/")


@login_required
def work_level_assign(request, pk):
    """Assign or clear work level for an employee (HTMX POST)."""
    employee = get_object_or_404(Employee, pk=pk)
    if request.method == "POST":
        level_id = request.POST.get("work_level")
        if level_id:
            try:
                employee.work_level = WorkLevel.objects.get(pk=level_id)
            except WorkLevel.DoesNotExist:
                employee.work_level = None
        else:
            employee.work_level = None
        employee.save(update_fields=["work_level"])
        messages.success(request, f"Đã cập nhật cấp bậc cho {employee.get_full_name()}")
    return _htmx_refresh_or_redirect(request)


@login_required
def work_level_auto_assign_emp(request, pk):
    """Auto-assign best matching level to a single employee."""
    if request.method != "POST":
        return redirect(request.META.get("HTTP_REFERER") or "/")
    employee = get_object_or_404(Employee, pk=pk)
    level = _suggest_level(employee)
    if level:
        employee.work_level = level
        employee.save(update_fields=["work_level"])
        messages.success(request, f"Đã tự động gán {level} cho {employee.get_full_name()}")
    else:
        messages.warning(
            request,
            f"Không tìm được cấp bậc phù hợp với mức lương của {employee.get_full_name()}"
        )
    return _htmx_refresh_or_redirect(request)


# ─── HR Settings: CRUD for 8 Levels ────────────────────────────────────────────

@login_required
def work_level_settings(request):
    levels = WorkLevel.objects.all()
    return render(
        request,
        "employee/work_level/settings.html",
        {"levels": levels},
    )


@login_required
def work_level_create(request):
    from employee.forms import WorkLevelForm
    if request.method == "POST":
        form = WorkLevelForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, "Đã tạo cấp bậc thành công")
            return HttpResponse("<script>window.location.reload()</script>")
    else:
        form = WorkLevelForm()
    return render(request, "employee/work_level/level_form.html", {"form": form})


@login_required
def work_level_update(request, pk):
    from employee.forms import WorkLevelForm
    level = get_object_or_404(WorkLevel, pk=pk)
    if request.method == "POST":
        form = WorkLevelForm(request.POST, instance=level)
        if form.is_valid():
            form.save()
            messages.success(request, "Đã cập nhật cấp bậc")
            return HttpResponse("<script>window.location.reload()</script>")
    else:
        form = WorkLevelForm(instance=level)
    return render(
        request,
        "employee/work_level/level_form.html",
        {"form": form, "level": level},
    )


@login_required
def work_level_delete(request, pk):
    level = get_object_or_404(WorkLevel, pk=pk)
    name = str(level)
    level.delete()
    messages.success(request, f"Đã xóa {name}")
    return HttpResponse("<script>window.location.reload()</script>")


@login_required
def work_level_bulk_auto_assign(request):
    """Batch: assign best-matching level to all active employees."""
    employees = Employee.objects.filter(is_active=True)
    total = employees.count()
    assigned = 0
    for emp in employees:
        level = _suggest_level(emp)
        if level:
            emp.work_level = level
            emp.save(update_fields=["work_level"])
            assigned += 1
    messages.success(request, f"Đã tự động gán cấp bậc cho {assigned}/{total} nhân viên")
    return redirect("work-level-settings")
