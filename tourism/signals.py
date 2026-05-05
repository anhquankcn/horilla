"""tourism/signals.py

When a TourSchedule is marked 'completed', credit each attending employee
with compensatory leave days ('Nghỉ bù Tour / Lễ') equal to the number of
days they were present on that tour.

Trigger  : TourSchedule.post_save, status → "completed"
Guard    : leave_allocated flag prevents double-credit on re-saves
Write    : AvailableLeave.get_or_create + F() for atomic increment
"""

import logging

from django.db.models import F
from django.db.models.signals import post_save
from django.dispatch import receiver

from tourism.models import TourAttendance, TourSchedule

logger = logging.getLogger(__name__)

COMP_LEAVE_NAME = "Nghỉ bù Tour / Lễ"


@receiver(post_save, sender=TourSchedule)
def allocate_compensatory_leave(sender, instance, **kwargs):
    """Credit compensatory leave for each employee who was present on the tour."""
    if instance.status != "completed" or instance.leave_allocated:
        return

    # Lazy import to avoid circular deps at app startup
    from leave.models import AvailableLeave, LeaveType

    leave_type = LeaveType.objects.filter(name=COMP_LEAVE_NAME).first()
    if not leave_type:
        logger.warning(
            "Compensatory leave type '%s' not found — run setup_hnh_company first.",
            COMP_LEAVE_NAME,
        )
        return

    # Count present days per employee in a single query
    from django.db.models import Count

    per_employee = (
        TourAttendance.objects.filter(
            tour_schedule=instance,
            status="present",
        )
        .values("employee_id")
        .annotate(present_days=Count("id"))
    )

    if not per_employee:
        logger.info("TourSchedule %s completed with no present attendance records.", instance.pk)
        _mark_allocated(instance)
        return

    for row in per_employee:
        emp_id = row["employee_id"]
        days = row["present_days"]
        al, created = AvailableLeave.objects.get_or_create(
            employee_id_id=emp_id,
            leave_type_id=leave_type,
            defaults={"available_days": 0},
        )
        AvailableLeave.objects.filter(pk=al.pk).update(
            available_days=F("available_days") + days,
            total_leave_days=F("total_leave_days") + days,
        )
        logger.info(
            "Allocated %s comp-leave day(s) to employee_id=%s for schedule %s.",
            days,
            emp_id,
            instance.schedule_code,
        )

    _mark_allocated(instance)


def _mark_allocated(schedule):
    """Set leave_allocated=True without re-triggering the post_save signal."""
    TourSchedule.objects.filter(pk=schedule.pk).update(leave_allocated=True)
