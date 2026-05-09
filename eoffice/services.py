"""eoffice/services.py — Single enforcement point for WorkTask mutations."""

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone


# (from_status, to_status) pairs an assignee is allowed to make
_ASSIGNEE_ALLOWED = {
    ("to_do", "in_progress"),
    ("in_progress", "done"),
    ("to_do", "blocked"),
    ("in_progress", "blocked"),
    ("blocked", "in_progress"),
}


def _actor_role(task, actor):
    """Return 'admin', 'manager', or 'assignee' for the given actor Employee."""
    user = actor.employee_user_id
    if user.is_superuser or user.has_perm("eoffice.change_worktask"):
        return "admin"
    try:
        actor_dept = actor.employee_work_info.department_id_id
    except Exception:
        actor_dept = None
    if actor_dept and actor_dept == task.department_id:
        # Employees in same department who aren't the assignee are treated as managers.
        # A real permission model would use a Manager role flag; for Phase 1a we approximate
        # by checking department match + not being the direct assignee.
        if task.assigned_to_id != actor.pk:
            return "manager"
    return "assignee"


@transaction.atomic
def transition_status(task, new_status, actor, reason=None):
    """
    Apply a status transition to a WorkTask.

    Raises:
        ValueError: blocked transition with no reason.
        PermissionDenied: actor's role forbids this transition.
    """
    from eoffice.models import TaskComment

    old_status = task.status
    if old_status == new_status:
        return task

    if new_status == "blocked":
        if not reason or not reason.strip():
            raise ValueError("Lý do bị chặn là bắt buộc.")

    role = _actor_role(task, actor)
    if role == "assignee":
        if (old_status, new_status) not in _ASSIGNEE_ALLOWED:
            raise PermissionDenied(
                f"Bạn không có quyền chuyển trạng thái từ '{old_status}' sang '{new_status}'."
            )

    task.status = new_status

    if new_status == "done":
        task.completed_at = timezone.now()
        save_fields = ["status", "completed_at", "updated_at"]
    elif old_status == "done":
        # Moving out of done: reset recurrence guard so the cron can fire again.
        task.next_occurrence_created = False
        task.completed_at = None
        save_fields = ["status", "completed_at", "next_occurrence_created", "updated_at"]
    else:
        save_fields = ["status", "updated_at"]

    task.save(update_fields=save_fields)

    if new_status == "blocked" and reason:
        TaskComment.objects.create(
            task=task,
            author=actor,
            body=f"[Bị chặn] {reason.strip()}",
        )

    return task


def create_task(*, title, assigned_to, assigned_by, department, due_date=None,
                priority="normal", description="", recurrence_rule="none", parent_task=None):
    """
    Create a WorkTask via the service layer.
    Views must call this instead of WorkTask.objects.create() directly.
    """
    from eoffice.models import WorkTask

    task = WorkTask(
        title=title,
        assigned_to=assigned_to,
        assigned_by=assigned_by,
        department=department,
        due_date=due_date,
        priority=priority,
        description=description,
        recurrence_rule=recurrence_rule,
        parent_task=parent_task,
        status="to_do",
    )
    task.full_clean()
    task.save()
    return task
