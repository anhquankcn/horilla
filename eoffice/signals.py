"""eoffice/signals.py — Notification triggers for WorkTask events."""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.urls import reverse

from .models import TaskComment, WorkTask

logger = logging.getLogger(__name__)


def _safe_notify(sender, recipient_user, verb, redirect_url, icon="checkmark-circle"):
    """Wrap notify.send() so a missing notifications app never crashes the view."""
    try:
        from notifications.signals import notify
        notify.send(
            sender,
            recipient=recipient_user,
            verb=verb,
            verb_ar=verb,
            verb_de=verb,
            verb_es=verb,
            verb_fr=verb,
            redirect=redirect_url,
            icon=icon,
        )
    except Exception:
        logger.exception("Failed to send notification to %s", recipient_user)


@receiver(post_save, sender=WorkTask)
def worktask_post_save(sender, instance, created, **kwargs):
    if not created:
        return

    task = instance
    assignee_user = getattr(task.assigned_to, "employee_user_id", None)
    assigner_employee = task.assigned_by

    if assignee_user and assigner_employee and task.assigned_to_id != task.assigned_by_id:
        board_url = reverse("eoffice-board")
        verb = f"Bạn được giao công việc: {task.title}"
        _safe_notify(
            sender=assigner_employee,
            recipient_user=assignee_user,
            verb=verb,
            redirect_url=board_url,
            icon="clipboard",
        )


@receiver(post_save, sender=TaskComment)
def task_comment_post_save(sender, instance, created, **kwargs):
    if not created:
        return

    comment = instance
    task = comment.task
    commenter = comment.author

    edit_url = reverse("eoffice-task-edit", kwargs={"pk": task.pk})

    # Notify task creator (assigned_by) and assignee — but not the commenter themselves
    recipients = set()
    if task.assigned_by and task.assigned_by != commenter:
        user = getattr(task.assigned_by, "employee_user_id", None)
        if user:
            recipients.add(user)
    if task.assigned_to and task.assigned_to != commenter:
        user = getattr(task.assigned_to, "employee_user_id", None)
        if user:
            recipients.add(user)

    verb = f"Bình luận mới trong: {task.title}"
    for user in recipients:
        _safe_notify(
            sender=commenter or task.assigned_by,
            recipient_user=user,
            verb=verb,
            redirect_url=edit_url,
            icon="chatbubble",
        )
