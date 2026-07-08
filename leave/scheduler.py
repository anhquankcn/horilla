import sys
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from horilla.signals import post_scheduler, pre_scheduler


def leave_reset():
    pre_scheduler.send(sender=leave_reset)
    from leave.models import LeaveType

    today = datetime.now()
    today_date = today.date()
    leave_types = LeaveType.objects.filter(reset=True)
    # Looping through filtered leave types with reset is true
    for leave_type in leave_types:
        # Looping through all available leaves
        available_leaves = leave_type.employee_available_leave.all()

        for available_leave in available_leaves:
            reset_date = available_leave.reset_date
            expired_date = available_leave.expired_date
            if reset_date == today_date:
                available_leave.update_carryforward()
                # new_reset_date = available_leave.set_reset_date(assigned_date=today_date,available_leave = available_leave)
                new_reset_date = available_leave.set_reset_date(
                    assigned_date=today_date, available_leave=available_leave
                )
                available_leave.reset_date = new_reset_date
                available_leave.save()
            if expired_date and expired_date <= today_date:
                new_expired_date = available_leave.set_expired_date(
                    available_leave=available_leave, assigned_date=today_date
                )
                available_leave.expired_date = new_expired_date
                available_leave.save()

        if (
            leave_type.carryforward_expire_date
            and leave_type.carryforward_expire_date <= today_date
        ):
            leave_type.carryforward_expire_date = leave_type.set_expired_date(
                today_date
            )
            leave_type.save()
    post_scheduler.send(
        sender=leave_reset,
        **{
            "today": today,
            "today_date": today_date,
            "leave_types": leave_types,
        }
    )


def leave_approval_reminder():
    """HNH #4 — nhắc người duyệt các đơn nghỉ TREO (status='requested').

    Lịch (chốt): gửi lần 1 khi đơn chờ >=3 ngày, lần 2 khi >=4 ngày, lần 3 khi
    >=5 ngày rồi dừng (tổng 3 lần nhắc). Idempotent qua atomic CAS trên
    reminder_count (WHERE reminder_count=target) → an toàn dù job chạy trên nhiều
    gunicorn worker: chỉ 1 worker "giành" được mỗi lần nhắc.
    """
    import contextlib
    from datetime import date

    from django.utils import timezone as dj_tz

    from leave.models import (
        LeaveRequest,
        LeaveRequestConditionApproval,
        resolve_cb_manager,
    )
    from notifications.signals import notify

    today = date.today()
    # (tuổi tối thiểu, reminder_count kỳ vọng) cho từng lần nhắc
    stages = [(3, 0), (4, 1), (5, 2)]

    pending = LeaveRequest.objects.filter(status="requested").select_related(
        "employee_id__employee_work_info__reporting_manager_id__employee_user_id",
        "leave_type_id",
    )
    for lr in pending:
        req_date = lr.requested_date
        if req_date is None:
            continue
        age = (today - req_date).days
        target = None
        for min_age, expect in stages:
            if age >= min_age and lr.reminder_count == expect:
                target = expect
                break
        if target is None:
            continue

        # Atomic claim — chỉ worker đổi được reminder_count target->target+1 mới gửi.
        claimed = LeaveRequest.objects.filter(
            id=lr.id, reminder_count=target
        ).update(reminder_count=target + 1, last_reminded_at=dj_tz.now())
        if not claimed:
            continue

        # Người nhận = reporting_manager + C&B cố định + condition-approver đang chờ.
        recipients = {}
        wi = getattr(lr.employee_id, "employee_work_info", None)
        rm = wi.reporting_manager_id if wi else None
        if rm and rm.employee_user_id_id:
            recipients[rm.employee_user_id_id] = rm.employee_user_id
        cb = resolve_cb_manager(lr.employee_id)
        if cb and cb.employee_user_id_id:
            recipients[cb.employee_user_id_id] = cb.employee_user_id
        cond = LeaveRequestConditionApproval.objects.filter(
            leave_request_id=lr, is_approved=False, is_rejected=False
        ).select_related("manager_id__employee_user_id")
        for ca in cond:
            m = ca.manager_id
            if m and m.employee_user_id_id:
                recipients[m.employee_user_id_id] = m.employee_user_id

        verb = (
            f"Nhắc duyệt: đơn nghỉ {lr.leave_type_id.name} của {lr.employee_id} "
            f"đã chờ {age} ngày chưa duyệt"
        )
        redirect = f"/leave/request-view?id={lr.id}"
        for user in recipients.values():
            with contextlib.suppress(Exception):
                notify.send(lr.employee_id, recipient=user, verb=verb,
                            icon="alarm", redirect=redirect)


if not any(
    cmd in sys.argv
    for cmd in ["makemigrations", "migrate", "compilemessages", "flush", "shell"]
):
    """
    Initializes and starts background tasks using APScheduler when the server is running.
    """
    from apscheduler.triggers.cron import CronTrigger

    scheduler = BackgroundScheduler()
    scheduler.add_job(leave_reset, "interval", seconds=20)
    # #4 — nhắc duyệt: chạy 08:00 giờ VN mỗi ngày (CAS guard chống trùng worker).
    scheduler.add_job(
        leave_approval_reminder,
        CronTrigger(hour=8, minute=0, timezone="Asia/Ho_Chi_Minh"),
        id="leave_approval_reminder",
        replace_existing=True,
    )

    scheduler.start()
