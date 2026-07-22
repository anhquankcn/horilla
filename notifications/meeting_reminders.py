"""Nhắc họp trước 15 phút — gọi mỗi phút từ auto_clock loop.

Tìm GoogleMeeting bắt đầu sau ~15 phút, đẩy web push tới host + attendee là
nhân viên đã bật ``meeting_reminder_enabled``. Dedup theo vòng đời process
(kết hợp cửa sổ 1 phút nên gần như không gửi trùng)."""
import logging
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)

_reminded = set()  # {meeting_id} đã nhắc trong process này


def _attendee_emails(meeting):
    emails = set()
    for a in (meeting.attendees or []):
        if isinstance(a, str):
            emails.add(a.strip().lower())
        elif isinstance(a, dict):
            e = a.get("email") or a.get("Email")
            if e:
                emails.add(str(e).strip().lower())
    return emails


def run_meeting_reminders():
    """Idempotent trong 1 phút — an toàn gọi mỗi tick."""
    try:
        from horilla_meet.models import GoogleMeeting
        from employee.models import Employee
        from notifications.push import send_web_push
    except Exception:
        return

    now = timezone.now()
    lo, hi = now + timedelta(minutes=15), now + timedelta(minutes=16)
    meetings = (
        GoogleMeeting.objects.filter(start_time__gte=lo, start_time__lt=hi)
        # Chỉ lịch CHÍNH THỨC: bỏ lịch đã huỷ (Outlook đặt tiêu đề "Canceled: ...").
        .exclude(title__icontains="cancel")
        .select_related("employee_id")
    )

    for m in meetings:
        if m.id in _reminded:
            continue
        _reminded.add(m.id)

        recipients = {}  # user_id -> user (dedup)
        candidates = []
        if m.employee_id is not None:
            candidates.append(m.employee_id)
        emails = _attendee_emails(m)
        if emails:
            candidates += list(
                Employee.objects.filter(
                    Q(email__in=emails) | Q(employee_work_info__email__in=emails),
                    is_active=True,
                ).distinct()
            )

        start_local = timezone.localtime(m.start_time)
        title = "Nhắc lịch bận — 15 phút nữa"
        body = f"{m.title} bắt đầu lúc {start_local:%H:%M}"

        for e in candidates:
            prof = getattr(e, "hnh_profile", None)
            if prof is not None and not prof.meeting_reminder_enabled:
                continue  # NV đã tắt nhắc lịch bận
            user = getattr(e, "employee_user_id", None)
            if user is None or user.id in recipients:
                continue
            recipients[user.id] = user
            try:
                send_web_push(
                    user, title=title, body=body,
                    url=m.meet_url or "/pwa/notifications",
                    require_interaction=False, tag=f"meet-{m.id}",
                )
            except Exception as ex:
                logger.warning("meeting reminder push failed emp=%s: %s", e.id, ex)

        if recipients:
            logger.info("Meeting reminder sent: meeting=%s recipients=%d", m.id, len(recipients))

    if len(_reminded) > 5000:
        _reminded.clear()
