"""API regression tests."""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone as django_tz

from employee.models import Employee, EmployeeWorkInformation
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


class _FakeKCResponse:
    status_code = 200

    def __init__(self, claims):
        self._claims = claims

    def json(self):
        return self._claims


@override_settings(KC_BASE="https://sso.example.test/realms/x")
class OIDCLoginWorkEmailFallbackTests(TestCase):
    """Regression (prod 2026-07-30): mobile OIDC login 403 'no matching user'.

    39 active employees carry their real corporate email in
    EmployeeWorkInformation.email (which is what Keycloak authenticates against),
    but their Horilla User account was provisioned with a legacy role-based
    username (admin3@, ca.sales1@, marketing1@…). OIDCLoginAPIView only matched
    User.email / User.username against the Keycloak email, never the work email,
    so every one of them got 403. Phan Công Vũ (vu.pc@hongngocha.com → User
    admin3@hongngocha.com) is the first who tried. Fix: fall back to a unique
    active EmployeeWorkInformation.email → its linked active User.
    """

    def setUpEmployee(self, work_email, username):
        user = User.objects.create_user(username=username, email=username, password="x")
        emp = Employee.objects.create(
            employee_first_name="Vũ", employee_last_name="Phan Công",
            badge_id="TST-OIDC-1", employee_user_id=user,
        )
        EmployeeWorkInformation.objects.create(employee_id=emp, email=work_email)
        return user

    def _post(self, email):
        with patch(
            "horilla_api.api_views.auth.views.http_requests.get",
            return_value=_FakeKCResponse({"email": email, "preferred_username": email}),
        ):
            return self.client.post(
                "/api/auth/oidc-login/", {"access_token": "fake"},
                content_type="application/json",
            )

    def test_matches_via_work_email_when_username_differs(self):
        """KC email = work email, but User.username is a legacy placeholder → 200."""
        self.setUpEmployee("vu.pc@hongngocha.com", "admin3@hongngocha.com")
        resp = self._post("vu.pc@hongngocha.com")
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_unknown_email_still_rejected(self):
        """No user, no work-email match → 403 (fallback must not over-match)."""
        self.setUpEmployee("vu.pc@hongngocha.com", "admin3@hongngocha.com")
        resp = self._post("stranger@hongngocha.com")
        self.assertEqual(resp.status_code, 403)

    def test_inactive_employee_not_matched(self):
        """Work email on an inactive employee must NOT grant login."""
        user = self.setUpEmployee("gone.emp@hongngocha.com", "old.role@hongngocha.com")
        emp = user.employee_get
        emp.is_active = False
        emp.save(update_fields=["is_active"])
        resp = self._post("gone.emp@hongngocha.com")
        self.assertEqual(resp.status_code, 403)
