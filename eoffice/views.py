"""eoffice/views.py"""

import logging
from datetime import timedelta

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from django.views.decorators.http import require_POST

from .forms import TaskCommentForm, TaskStatusForm, WorkTaskForm
from .models import DashboardVisit, TaskComment, WorkTask
from .services import transition_status

logger = logging.getLogger(__name__)


def _get_employee(request):
    """Return Employee for the current user, or None."""
    return getattr(request.user, "employee_get", None)


def _board_queryset(request, employee):
    """Return the WorkTask queryset filtered by the actor's role."""
    user = request.user
    base = WorkTask.objects.filter(is_active=True).select_related(
        "assigned_to", "assigned_by", "department", "parent_task"
    )
    if user.is_superuser or user.has_perm("eoffice.change_worktask"):
        return base
    if employee:
        try:
            dept = employee.employee_work_info.department_id
        except Exception:
            dept = None
        if dept:
            return base.filter(department=dept)
        return base.filter(assigned_to=employee)
    return base.none()


# ─── Board ────────────────────────────────────────────────────────────────────

@login_required
def board(request):
    employee = _get_employee(request)
    qs = _board_queryset(request, employee)

    filter_by = request.GET.get("filter", "all")
    today = timezone.localdate()

    if filter_by == "overdue":
        qs = qs.filter(due_date__lt=today, status__in=["to_do", "in_progress"])
    elif filter_by == "blocked":
        qs = qs.filter(status="blocked")
    elif filter_by == "mine" and employee:
        qs = qs.filter(assigned_to=employee)

    tasks_by_status = {
        "to_do": qs.filter(status="to_do").order_by("due_date", "-priority"),
        "in_progress": qs.filter(status="in_progress").order_by("due_date", "-priority"),
        "blocked": qs.filter(status="blocked").order_by("due_date"),
        "done": qs.filter(status="done").order_by("-completed_at")[:10],
    }

    overdue_count = qs.filter(due_date__lt=today, status__in=["to_do", "in_progress"]).count()
    blocked_count = qs.filter(status="blocked").count()

    context = {
        "tasks_by_status": tasks_by_status,
        "filter_by": filter_by,
        "today": today,
        "overdue_count": overdue_count,
        "blocked_count": blocked_count,
        "employee": employee,
    }
    return render(request, "eoffice/board.html", context)


# ─── Task create / edit ────────────────────────────────────────────────────────

@login_required
def task_create(request):
    employee = _get_employee(request)
    initial = {}
    parent_pk = request.GET.get("parent")
    if parent_pk:
        try:
            initial["parent_task"] = int(parent_pk)
        except (ValueError, TypeError):
            pass
    form = WorkTaskForm(request.POST or None, request=request, initial=initial)

    if request.method == "POST" and form.is_valid():
        task = form.save(commit=False)
        task.assigned_by = employee
        # Auto-fill department from assignee if not explicitly set
        if not task.department_id and task.assigned_to:
            try:
                task.department = task.assigned_to.employee_work_info.department_id
            except Exception:
                pass
        try:
            task.full_clean()
            task.save()
            messages.success(request, _("Công việc đã được tạo thành công."))
            return redirect("eoffice-board")
        except Exception as exc:
            messages.error(request, str(exc))

    return render(request, "eoffice/task_form.html", {
        "form": form,
        "title": _("Tạo công việc mới"),
        "submit_label": _("Tạo công việc"),
    })


@login_required
def task_edit(request, pk):
    task = get_object_or_404(WorkTask, pk=pk, is_active=True)
    employee = _get_employee(request)
    comments = TaskComment.objects.filter(task=task, is_active=True).select_related("author")
    comment_form = TaskCommentForm()
    subtasks = WorkTask.objects.filter(parent_task=task, is_active=True).select_related(
        "assigned_to", "department"
    )
    sidebar_tasks = _board_queryset(request, employee).order_by("-updated_at")[:20]

    form = WorkTaskForm(request.POST or None, instance=task, request=request)
    if request.method == "POST" and "save_task" in request.POST and form.is_valid():
        try:
            form.save()
            messages.success(request, _("Công việc đã được cập nhật."))
            return redirect("eoffice-task-edit", pk=pk)
        except Exception as exc:
            messages.error(request, str(exc))

    return render(request, "eoffice/task_detail.html", {
        "form": form,
        "task": task,
        "comments": comments,
        "comment_form": comment_form,
        "subtasks": subtasks,
        "sidebar_tasks": sidebar_tasks,
        "today": timezone.localdate(),
    })


@login_required
def task_archive(request, pk):
    task = get_object_or_404(WorkTask, pk=pk, is_active=True)
    task.is_active = False
    task.save(update_fields=["is_active", "updated_at"])
    messages.success(request, _("Công việc đã được lưu trữ."))
    return redirect("eoffice-board")


# ─── Status change ─────────────────────────────────────────────────────────────

@login_required
@require_POST
def task_status_change(request, pk):
    task = get_object_or_404(WorkTask, pk=pk, is_active=True)
    employee = _get_employee(request)
    if not employee:
        messages.error(request, _("Không tìm thấy thông tin nhân viên."))
        return redirect("eoffice-board")

    form = TaskStatusForm(request.POST)
    if form.is_valid():
        new_status = form.cleaned_data["status"]
        reason = form.cleaned_data.get("reason", "")
        try:
            transition_status(task, new_status, employee, reason=reason)
            messages.success(request, _("Đã cập nhật trạng thái."))
        except (ValueError, PermissionDenied) as exc:
            messages.error(request, str(exc))
        except Exception as exc:
            logger.exception("Unexpected error in task_status_change for task %s", pk)
            messages.error(request, _("Lỗi hệ thống, thử lại sau."))
    else:
        messages.error(request, _("Dữ liệu không hợp lệ."))

    return redirect("eoffice-board")


# ─── Comments ──────────────────────────────────────────────────────────────────

@login_required
@require_POST
def comment_create(request, pk):
    task = get_object_or_404(WorkTask, pk=pk, is_active=True)
    employee = _get_employee(request)
    form = TaskCommentForm(request.POST)
    if form.is_valid():
        comment = form.save(commit=False)
        comment.task = task
        comment.author = employee
        comment.save()
    return redirect("eoffice-task-edit", pk=pk)


# ─── Task list ────────────────────────────────────────────────────────────────

@login_required
def task_list(request):
    employee = _get_employee(request)
    qs = _board_queryset(request, employee)

    filter_by = request.GET.get("filter", "all")
    filter_status = request.GET.get("status", "")
    filter_priority = request.GET.get("priority", "")
    today = timezone.localdate()
    tomorrow = today + timedelta(days=1)
    next_week_end = today + timedelta(days=7)

    if filter_by == "mine" and employee:
        qs = qs.filter(assigned_to=employee)
    elif filter_by == "overdue":
        qs = qs.filter(due_date__lt=today, status__in=["to_do", "in_progress"])
    elif filter_by == "blocked":
        qs = qs.filter(status="blocked")

    if filter_status:
        qs = qs.filter(status=filter_status)
    if filter_priority:
        qs = qs.filter(priority=filter_priority)

    active_qs = qs.exclude(status="done")
    groups = [
        {
            "key": "past",
            "label": _("Trước đây"),
            "tasks": list(active_qs.filter(due_date__lt=today).order_by("due_date", "-priority")),
            "default_open": True,
        },
        {
            "key": "today",
            "label": _("Hôm nay"),
            "tasks": list(active_qs.filter(due_date=today).order_by("-priority")),
            "default_open": True,
        },
        {
            "key": "tomorrow",
            "label": _("Ngày mai"),
            "tasks": list(active_qs.filter(due_date=tomorrow).order_by("-priority")),
            "default_open": True,
        },
        {
            "key": "this_week",
            "label": _("Tuần này"),
            "tasks": list(active_qs.filter(due_date__gt=tomorrow, due_date__lte=next_week_end).order_by("due_date", "-priority")),
            "default_open": True,
        },
        {
            "key": "later",
            "label": _("Sau này"),
            "tasks": list(active_qs.filter(due_date__gt=next_week_end).order_by("due_date")),
            "default_open": False,
        },
        {
            "key": "no_date",
            "label": _("Không có thời hạn"),
            "tasks": list(active_qs.filter(due_date__isnull=True).order_by("-priority")),
            "default_open": False,
        },
    ]
    done_tasks = list(qs.filter(status="done").order_by("-completed_at")[:30])

    context = {
        "groups": groups,
        "done_tasks": done_tasks,
        "filter_by": filter_by,
        "filter_status": filter_status,
        "filter_priority": filter_priority,
        "today": today,
        "employee": employee,
    }
    return render(request, "eoffice/task_list.html", context)


# ─── Dashboard ────────────────────────────────────────────────────────────────

@login_required
def dashboard(request):
    employee = _get_employee(request)
    is_manager = request.user.is_superuser or request.user.has_perm("eoffice.change_worktask")
    if not is_manager:
        return redirect("eoffice-board")

    # Record visit for Phase 1b gate criterion
    DashboardVisit.objects.create(user=request.user)

    today = timezone.localdate()
    try:
        window_days = min(int(request.GET.get("days", 30)), 365)
    except (ValueError, TypeError):
        window_days = 30
    window_start = today - timedelta(days=window_days)

    dept_stats = (
        WorkTask.objects.filter(is_active=True, created_at__date__gte=window_start)
        .values("department__department", "department_id")
        .annotate(
            total=Count("id"),
            overdue=Count("id", filter=Q(due_date__lt=today, status__in=["to_do", "in_progress"])),
            blocked=Count("id", filter=Q(status="blocked")),
            done=Count("id", filter=Q(status="done")),
        )
        .order_by("-overdue", "-total")
    )

    overdue_tasks = (
        WorkTask.objects.filter(
            is_active=True,
            due_date__lt=today,
            status__in=["to_do", "in_progress"],
        )
        .select_related("assigned_to", "department")
        .order_by("due_date")[:20]
    )

    totals = WorkTask.objects.filter(is_active=True, created_at__date__gte=window_start).aggregate(
        total=Count("id"),
        overdue_count=Count("id", filter=Q(due_date__lt=today, status__in=["to_do", "in_progress"])),
        blocked_count=Count("id", filter=Q(status="blocked")),
        done_count=Count("id", filter=Q(status="done")),
    )

    context = {
        "dept_stats": dept_stats,
        "overdue_tasks": overdue_tasks,
        "totals": totals,
        "window_days": window_days,
        "today": today,
    }
    return render(request, "eoffice/dashboard.html", context)
