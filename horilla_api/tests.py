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


@override_settings(ALLOWED_HOSTS=["testserver", "qlns.hnhtravel.work"])
class SuspendEmployeeTests(TestCase):
    """Regression (prod 2026-08-01): C&B không chuyển được NV sang Tạm nghỉ.

    Root cause: Employee.save() (employee/models.py) có guard — trong ngữ cảnh
    HTTP request, nếu set is_active=False mà get_archive_condition() != False
    (NV còn là reporting_manager của ai đó, KỂ CẢ người đã nghỉ), nó ÉP
    is_active=True và lưu lại. Nên PUT is_active=false trả 200 nhưng NV vẫn active.
    SuspendEmployeeView dùng queryset .update() để bypass guard, chỉ chặn khi còn
    cấp dưới ĐANG hoạt động, và gỡ FK quản lý của cấp dưới đã nghỉ.
    """

    def _actor(self):
        return User.objects.create_user(
            username="cb.super", email="cb.super@x.test", password="x", is_superuser=True
        )

    def _emp(self, first, last, badge, active=True):
        u = User.objects.create_user(username=badge + "@x.test", email=badge + "@x.test", password="x")
        e = Employee.objects.create(
            employee_first_name=first, employee_last_name=last, badge_id=badge,
            employee_user_id=u,
        )
        if not active:
            Employee.objects.filter(pk=e.pk).update(is_active=False)
            User.objects.filter(pk=u.pk).update(is_active=False)
            e.refresh_from_db()
        return e

    def _suspend(self, actor, emp):
        from rest_framework.test import APIClient
        c = APIClient()
        c.force_authenticate(user=actor)
        return c.post(f"/api/employee/employees/{emp.pk}/suspend/", {}, format="json",
                      HTTP_HOST="qlns.hnhtravel.work")

    def test_blocked_when_active_subordinate_exists(self):
        """Manager của người ĐANG làm việc → 400, không suspend, có blocking_reports."""
        actor = self._actor()
        mgr = self._emp("Quản", "Lý", "TST-MGR-1")
        sub = self._emp("Cấp", "Dưới", "TST-SUB-1")
        wi = EmployeeWorkInformation.objects.create(employee_id=sub)
        wi.reporting_manager_id = mgr
        wi.save()
        resp = self._suspend(actor, mgr)
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertTrue(resp.json().get("blocking_reports"))
        mgr.refresh_from_db()
        self.assertTrue(mgr.is_active)  # vẫn active

    def test_suspend_succeeds_with_only_inactive_subordinate(self):
        """Manager chỉ còn cấp dưới ĐÃ NGHỈ → suspend được (bypass guard) + gỡ FK."""
        actor = self._actor()
        mgr = self._emp("Lê Hồng", "Nhân", "TST-MGR-2")
        gone = self._emp("Đã", "Nghỉ", "TST-SUB-2", active=False)
        wi = EmployeeWorkInformation.objects.create(employee_id=gone)
        EmployeeWorkInformation.objects.filter(pk=wi.pk).update(reporting_manager_id=mgr.pk)
        resp = self._suspend(actor, mgr)
        self.assertEqual(resp.status_code, 200, resp.content)
        mgr.refresh_from_db()
        self.assertFalse(mgr.is_active)  # ĐÃ suspend thật (guard bị bypass)
        self.assertFalse(mgr.employee_user_id.is_active)  # user cũng bị khoá
        wi.refresh_from_db()
        self.assertIsNone(wi.reporting_manager_id_id)  # FK stale đã gỡ

    def test_suspend_plain_employee(self):
        """NV thường không quản lý ai → suspend bình thường."""
        actor = self._actor()
        emp = self._emp("Nhân", "Viên", "TST-EMP-3")
        resp = self._suspend(actor, emp)
        self.assertEqual(resp.status_code, 200, resp.content)
        emp.refresh_from_db()
        self.assertFalse(emp.is_active)


class M2MClientIPTests(TestCase):
    """Regression (prod 2026-08-12): máy chấm công ronaljack bị 403 'Nguồn gọi không
    nằm trong dải mạng cho phép'.

    Root cause: Tailscale ở máy VP (it7067081928) offline → connector fallback gọi
    qua URL công khai (Cloudflare). Traffic public tới HRM mang IP gateway Docker
    172.20.0.1 (cloudflared→nginx→web), trong khi account chỉ mở dải Tailscale
    100.64.0.0/10 → Layer-1 chặn. Fix: _get_client_ip ưu tiên CF-Connecting-IP (IP
    thật do Cloudflare set) nhưng CHỈ khi hop tới là IP nội bộ Docker (chống giả mạo
    header khi hit thẳng nginx qua Tailscale), + allowlist IP công cộng VP.
    """

    def _ip(self, **meta):
        from horilla_api.m2m_auth import _get_client_ip

        class _Req:
            pass

        r = _Req()
        r.META = meta
        return _get_client_ip(r)

    def test_cf_ip_trusted_when_hop_is_docker_internal(self):
        """Qua Cloudflare: hop = gateway Docker → tin CF-Connecting-IP (IP thật VP)."""
        self.assertEqual(
            self._ip(HTTP_X_REAL_IP="172.20.0.1", HTTP_CF_CONNECTING_IP="222.253.41.190"),
            "222.253.41.190",
        )

    def test_cf_ip_ignored_when_hop_is_external_anti_spoof(self):
        """Hit thẳng nginx qua Tailscale (peer 100.x) + CF header giả → KHÔNG tin,
        dùng peer thật để không cho vượt allowlist bằng header giả mạo."""
        self.assertEqual(
            self._ip(HTTP_X_REAL_IP="100.81.191.29", HTTP_CF_CONNECTING_IP="8.8.8.8"),
            "100.81.191.29",
        )

    def test_falls_back_to_x_real_ip_without_cf_header(self):
        """Không có CF-Connecting-IP (đường Tailscale trực tiếp) → dùng X-Real-IP."""
        self.assertEqual(self._ip(HTTP_X_REAL_IP="100.81.191.29"), "100.81.191.29")

    def test_falls_back_to_remote_addr(self):
        self.assertEqual(self._ip(REMOTE_ADDR="127.0.0.1"), "127.0.0.1")

    def test_office_public_ip_passes_allowlist_via_cf(self):
        """End-to-end Layer-1: traffic public từ IP VP + allowlist đúng → pass."""
        from horilla_api.m2m_auth import _ip_in_cidrs

        ip = self._ip(HTTP_X_REAL_IP="172.20.0.1", HTTP_CF_CONNECTING_IP="222.253.41.190")
        cidrs = ["100.64.0.0/10", "222.253.41.190/32"]
        self.assertTrue(_ip_in_cidrs(ip, cidrs))
        # IP public lạ (không phải VP) vẫn bị chặn dù đi qua Cloudflare.
        other = self._ip(HTTP_X_REAL_IP="172.20.0.1", HTTP_CF_CONNECTING_IP="1.2.3.4")
        self.assertFalse(_ip_in_cidrs(other, cidrs))
