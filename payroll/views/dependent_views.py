"""
dependent_views.py

Views for EmployeeDependent (Người Phụ Thuộc TNCN) management.
Employee-facing: submit dependents from profile tab.
HR-facing: review and approve/reject panel.
"""

import contextlib

from django.contrib import messages
from django.contrib.auth.decorators import login_required, permission_required
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from base.methods import get_key_instances
from employee.models import Employee
from horilla.decorators import hx_request_required
from notifications.signals import notify
from payroll.models.dependent import EmployeeDependent


def _hr_users():
    from django.contrib.auth.models import Permission, User

    perm = Permission.objects.filter(codename="change_employeedependent").first()
    if perm:
        users = User.objects.filter(user_permissions=perm) | User.objects.filter(
            groups__permissions=perm
        )
        return users.distinct()
    from django.contrib.auth.models import Group

    hr_group = Group.objects.filter(name__in=["HR", "HR Manager", "HR Quản lý"]).first()
    if hr_group:
        return hr_group.user_set.all()
    return User.objects.filter(is_staff=True)


@login_required
@hx_request_required
def dependent_tab(request, pk, **kwargs):
    employee = get_object_or_404(Employee, pk=pk)
    dependents = employee.dependents.all().order_by("status", "full_name")
    return render(
        request,
        "payroll/tabs/dependent_tab.html",
        {
            "employee": employee,
            "dependents": dependents,
            "can_add": True,
        },
    )


@login_required
def dependent_create(request, employee_id):
    employee = get_object_or_404(Employee, pk=employee_id)

    # Employees can only create for themselves; HR can create for anyone
    own_employee = getattr(request.user, "employee_get", None)
    if own_employee != employee and not request.user.has_perm("payroll.add_employeedependent"):
        return HttpResponse(_("Không có quyền thực hiện thao tác này."), status=403)

    if request.method == "POST":
        full_name = request.POST.get("full_name", "").strip()
        dob = request.POST.get("dob", "").strip()
        relationship = request.POST.get("relationship", "").strip()
        mst_npt = request.POST.get("mst_npt", "").strip() or None
        start_date = request.POST.get("start_date", "").strip()
        note = request.POST.get("note", "").strip() or None
        document = request.FILES.get("document")

        errors = {}
        if not full_name:
            errors["full_name"] = "Vui lòng nhập họ và tên."
        if not dob:
            errors["dob"] = "Vui lòng nhập ngày sinh."
        if not relationship:
            errors["relationship"] = "Vui lòng chọn quan hệ."
        if not start_date:
            errors["start_date"] = "Vui lòng nhập ngày đăng ký hiệu lực."

        if not errors:
            dep = EmployeeDependent(
                employee=employee,
                full_name=full_name,
                dob=dob,
                relationship=relationship,
                mst_npt=mst_npt,
                start_date=start_date,
                note=note,
                status=EmployeeDependent.StatusChoice.PENDING,
            )
            if document:
                dep.document = document
            dep.save()

            with contextlib.suppress(Exception):
                hr_users = list(_hr_users())
                if hr_users:
                    notify.send(
                        sender=request.user,
                        recipient=hr_users,
                        verb=f"{employee} đã đăng ký người phụ thuộc mới",
                        description=f"{dep.full_name} ({dep.get_relationship_display()})",
                        icon="people-circle",
                    )

            messages.success(
                request,
                f"Đã gửi đăng ký người phụ thuộc '{full_name}' — chờ HR phê duyệt.",
            )
            return render(
                request,
                "payroll/tabs/dependent_tab.html",
                {
                    "employee": employee,
                    "dependents": employee.dependents.all().order_by("status", "full_name"),
                    "can_add": True,
                },
            )

        return render(
            request,
            "payroll/modals/dependent_form.html",
            {
                "employee": employee,
                "relationship_choices": EmployeeDependent.RelationshipChoice.choices,
                "errors": errors,
                "form": request.POST,
            },
        )

    return render(
        request,
        "payroll/modals/dependent_form.html",
        {
            "employee": employee,
            "relationship_choices": EmployeeDependent.RelationshipChoice.choices,
        },
    )


@login_required
def dependent_delete(request, dep_id):
    dep = get_object_or_404(EmployeeDependent, pk=dep_id)
    employee = dep.employee
    own_employee = getattr(request.user, "employee_get", None)

    can_delete = (
        (own_employee == employee and dep.status == EmployeeDependent.StatusChoice.PENDING)
        or request.user.has_perm("payroll.delete_employeedependent")
    )
    if not can_delete:
        return HttpResponse(_("Không có quyền xóa."), status=403)

    dep.delete()
    messages.success(request, "Đã xóa người phụ thuộc.")
    return render(
        request,
        "payroll/tabs/dependent_tab.html",
        {
            "employee": employee,
            "dependents": employee.dependents.all().order_by("status", "full_name"),
            "can_add": True,
        },
    )


@login_required
@permission_required("payroll.change_employeedependent")
def dependent_hr_panel(request):
    status_filter = request.GET.get("status", "pending")
    dependents = EmployeeDependent.objects.select_related("employee", "approved_by")
    if status_filter and status_filter != "all":
        dependents = dependents.filter(status=status_filter)
    dependents = dependents.order_by("employee__employee_first_name", "status")

    return render(
        request,
        "payroll/hr_panel/dependent_hr_panel.html",
        {
            "dependents": dependents,
            "status_filter": status_filter,
            "status_choices": EmployeeDependent.StatusChoice.choices,
        },
    )


@login_required
@permission_required("payroll.change_employeedependent")
def dependent_approve(request, dep_id):
    dep = get_object_or_404(EmployeeDependent, pk=dep_id)
    dep.status = EmployeeDependent.StatusChoice.APPROVED
    dep.approved_by = request.user
    dep.approved_at = timezone.now()
    dep.reject_reason = None
    dep.save()

    with contextlib.suppress(Exception):
        notify.send(
            sender=request.user,
            recipient=[dep.employee.employee_user_id],
            verb="Người phụ thuộc của bạn đã được phê duyệt",
            description=f"{dep.full_name} ({dep.get_relationship_display()})",
            icon="checkmark-circle",
        )

    messages.success(
        request,
        f"Đã duyệt người phụ thuộc '{dep.full_name}' của {dep.employee}.",
    )
    status_filter = request.GET.get("status", "pending")
    return redirect(f"/payroll/dependent-hr-panel/?status={status_filter}")


@login_required
@permission_required("payroll.change_employeedependent")
def dependent_reject(request, dep_id):
    if request.method != "POST":
        dep = get_object_or_404(EmployeeDependent, pk=dep_id)
        return render(
            request,
            "payroll/modals/dependent_reject_form.html",
            {"dep": dep},
        )

    dep = get_object_or_404(EmployeeDependent, pk=dep_id)
    reason = request.POST.get("reason", "").strip()
    dep.status = EmployeeDependent.StatusChoice.REJECTED
    dep.approved_by = request.user
    dep.approved_at = timezone.now()
    dep.reject_reason = reason or None
    dep.save()

    with contextlib.suppress(Exception):
        notify.send(
            sender=request.user,
            recipient=[dep.employee.employee_user_id],
            verb="Người phụ thuộc của bạn đã bị từ chối",
            description=f"{dep.full_name}: {reason}" if reason else dep.full_name,
            icon="close-circle",
        )

    messages.warning(
        request,
        f"Đã từ chối người phụ thuộc '{dep.full_name}' của {dep.employee}.",
    )
    status_filter = request.GET.get("status", "pending")
    return redirect(f"/payroll/dependent-hr-panel/?status={status_filter}")


@login_required
@permission_required("payroll.change_employeedependent")
def dependent_export_csv(request):
    import csv

    from django.http import HttpResponse as HR

    response = HR(content_type="text/csv; charset=utf-8-sig")
    response["Content-Disposition"] = 'attachment; filename="npt_approved.csv"'
    writer = csv.writer(response)
    writer.writerow(
        [
            "Nhân viên",
            "Họ và tên NPT",
            "Ngày sinh",
            "Quan hệ",
            "MST NPT",
            "Ngày đăng ký",
            "Trạng thái",
            "Người duyệt",
            "Ngày duyệt",
        ]
    )
    qs = EmployeeDependent.objects.filter(status="approved").select_related(
        "employee", "approved_by"
    )
    for dep in qs:
        writer.writerow(
            [
                str(dep.employee),
                dep.full_name,
                dep.dob.strftime("%d/%m/%Y"),
                dep.get_relationship_display(),
                dep.mst_npt or "",
                dep.start_date.strftime("%d/%m/%Y"),
                dep.get_status_display(),
                str(dep.approved_by) if dep.approved_by else "",
                dep.approved_at.strftime("%d/%m/%Y %H:%M") if dep.approved_at else "",
            ]
        )
    return response
