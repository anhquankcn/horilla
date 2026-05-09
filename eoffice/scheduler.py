"""eoffice/scheduler.py — APScheduler jobs for overdue alerts and recurring tasks.

Only started when RUN_SCHEDULER=1 env var is set (or runserver is in sys.argv).
Uses django_apscheduler (DB-backed) so jobs survive gunicorn multi-worker restarts.
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from django_apscheduler.jobstores import DjangoJobStore

logger = logging.getLogger(__name__)
_started = False


def check_overdue_tasks():
    """Send overdue notifications for tasks past due_date. Runs daily at 08:00 VN time."""
    from django.utils import timezone
    from .models import WorkTask
    from .signals import _safe_notify

    today = timezone.localdate()
    overdue = WorkTask.objects.filter(
        is_active=True,
        due_date__lt=today,
        status__in=["to_do", "in_progress"],
    ).select_related("assigned_to__employee_user_id", "assigned_by__employee_user_id")

    for task in overdue:
        days = (today - task.due_date).days
        verb = f"Công việc trễ {days} ngày: {task.title}"
        try:
            from django.urls import reverse
            url = reverse("eoffice-board")
        except Exception:
            url = "/eoffice/"

        for employee in {task.assigned_to, task.assigned_by}:
            if not employee:
                continue
            user = getattr(employee, "employee_user_id", None)
            if user:
                _safe_notify(
                    sender=employee,
                    recipient_user=user,
                    verb=verb,
                    redirect_url=url,
                    icon="alert-circle",
                )


def create_recurring_tasks():
    """Spawn next occurrence for done recurring tasks. Runs daily at 00:01 VN time."""
    from dateutil.relativedelta import relativedelta
    from datetime import timedelta
    from django.utils import timezone
    from .models import WorkTask

    due_tasks = WorkTask.objects.filter(
        is_active=True,
        status="done",
        recurrence_rule__in=["daily", "weekly", "monthly"],
        next_occurrence_created=False,
    )

    for task in due_tasks:
        try:
            rule = task.recurrence_rule
            base_date = task.due_date
            if rule == "daily":
                next_due = base_date + timedelta(days=1)
            elif rule == "weekly":
                next_due = base_date + timedelta(weeks=1)
            else:
                next_due = base_date + relativedelta(months=1)

            WorkTask.objects.create(
                title=task.title,
                description=task.description,
                assigned_to=task.assigned_to,
                assigned_by=task.assigned_by,
                department=task.department,
                priority=task.priority,
                due_date=next_due,
                recurrence_rule=task.recurrence_rule,
                parent_task=task.parent_task,
            )
            task.next_occurrence_created = True
            task.save(update_fields=["next_occurrence_created", "updated_at"])
            logger.info("Recurring task spawned: %s → next due %s", task.title, next_due)
        except Exception:
            logger.exception("Failed to spawn recurring task for WorkTask pk=%s", task.pk)


def start_scheduler():
    global _started
    if _started:
        return
    _started = True

    scheduler = BackgroundScheduler()
    scheduler.add_jobstore(DjangoJobStore(), "default")

    scheduler.add_job(
        check_overdue_tasks,
        trigger=CronTrigger(hour=8, minute=0, timezone="Asia/Ho_Chi_Minh"),
        id="eoffice_check_overdue",
        replace_existing=True,
    )
    scheduler.add_job(
        create_recurring_tasks,
        trigger=CronTrigger(hour=0, minute=1, timezone="Asia/Ho_Chi_Minh"),
        id="eoffice_create_recurring",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("eOffice scheduler started.")
