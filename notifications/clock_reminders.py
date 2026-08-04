"""Nhắc chấm công — gọi mỗi phút (cron).

Mỗi nhân viên (role Nhân viên) tự bật ``clock_reminder_enabled`` và đặt tối đa 4
mốc giờ ``clock_reminder_times`` (HH:MM, phút chia hết 10). Khi giờ VN hiện tại
khớp một mốc → đẩy web push nhắc đến giờ chấm công. Default TẮT cho mọi NV.

Idempotent trong 1 phút (dedup theo (profile_id, HH:MM, ngày) trong process)."""
import logging

from django.utils import timezone

logger = logging.getLogger(__name__)

_sent = set()  # {(profile_id, 'YYYY-MM-DD HH:MM')} đã nhắc trong process này


def run_clock_reminders():
    """An toàn gọi mỗi tick (cron mỗi phút)."""
    try:
        from employee.models import HNHEmployeeProfile
        from notifications.push import send_web_push
    except Exception:
        return

    now = timezone.localtime(timezone.now())
    hhmm = now.strftime("%H:%M")
    daykey = now.strftime("%Y-%m-%d")

    profiles = (
        HNHEmployeeProfile.objects.filter(clock_reminder_enabled=True)
        .select_related("employee_id", "employee_id__employee_user_id")
    )

    sent_count = 0
    for prof in profiles:
        times = prof.clock_reminder_times or []
        if hhmm not in times:
            continue
        dedup = (prof.id, f"{daykey} {hhmm}")
        if dedup in _sent:
            continue
        _sent.add(dedup)

        emp = prof.employee_id
        if emp is None or not emp.is_active:
            continue
        user = getattr(emp, "employee_user_id", None)
        if user is None:
            continue
        try:
            send_web_push(
                user,
                title="Nhắc chấm công",
                body=f"Đã đến giờ chấm công ({hhmm}). Đừng quên chấm công nhé!",
                url="/pwa/attendance",
                require_interaction=False,
                tag=f"clock-reminder-{daykey}-{hhmm}",
            )
            sent_count += 1
        except Exception as ex:  # noqa: BLE001
            logger.warning("clock reminder push failed emp=%s: %s", emp.id, ex)

    if sent_count:
        logger.info("Clock reminders sent: %d @ %s", sent_count, hhmm)

    if len(_sent) > 5000:
        _sent.clear()
