"""API regression tests."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone as django_tz

from employee.models import Employee
from attendance.models import AttendanceActivity


class IsClockedInTests(TestCase):
    """Regression: _is_clocked_in must agree with CheckingStatus.status.

    Bug (prod 2026-06-18): a clock-in left open from the previous evening (forgotten
    clock-out, NCO) stayed within an 18h window, so the SERVER gate _is_clocked_in
    returned True and rejected today's clock-in with 400 'Already clocked-in'. But
    CheckingStatus.status only looks at TODAY's activities, so the PWA showed the
    user as not-clocked-in and kept calling clock-IN (never clock-out) → every punch
    was rejected and "chấm công không ghi nhận". The two checks must use the same
    definition: clocked-in == open activity dated today.
    """

    @classmethod
    def setUpTestData(cls):
        cls.emp = Employee.objects.create(
            employee_first_name="Test", employee_last_name="ALD26", badge_id="TST-CLK-1"
        )

    def _is_clocked_in(self):
        from horilla_api.api_views.attendance.views import _is_clocked_in
        return _is_clocked_in(self.emp)

    def test_open_activity_from_yesterday_does_not_block_today(self):
        """Forgotten clock-out from yesterday (within 18h) must NOT count as clocked-in."""
        now = django_tz.now()
        yesterday = django_tz.localdate() - timedelta(days=1)
        AttendanceActivity.objects.create(
            employee_id=self.emp,
            attendance_date=yesterday,
            clock_in_date=yesterday,
            clock_in=(now - timedelta(hours=16)).time(),
            in_datetime=now - timedelta(hours=16),  # < 18h ago: old logic wrongly blocked
            clock_out=None,
        )
        self.assertFalse(self._is_clocked_in())

    def test_open_activity_today_counts_as_clocked_in(self):
        """An open activity dated today IS clocked-in (next tap should clock-out)."""
        now = django_tz.now()
        today = django_tz.localdate()
        AttendanceActivity.objects.create(
            employee_id=self.emp,
            attendance_date=today,
            clock_in_date=today,
            clock_in=now.time(),
            in_datetime=now,
            clock_out=None,
        )
        self.assertTrue(self._is_clocked_in())

    def test_closed_activity_today_is_not_clocked_in(self):
        """After clocking out today, not clocked-in (next tap clocks in again)."""
        now = django_tz.now()
        today = django_tz.localdate()
        AttendanceActivity.objects.create(
            employee_id=self.emp,
            attendance_date=today,
            clock_in_date=today,
            clock_in=(now - timedelta(hours=2)).time(),
            in_datetime=now - timedelta(hours=2),
            clock_out=now.time(),
            clock_out_date=today,
        )
        self.assertFalse(self._is_clocked_in())

    def test_no_activity_is_not_clocked_in(self):
        self.assertFalse(self._is_clocked_in())
