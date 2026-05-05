"""tourism/tests.py — signal smoke tests for tour→leave automation."""

import datetime
from unittest.mock import MagicMock

from django.contrib.auth.models import AnonymousUser, User
from django.test import TestCase

from employee.models import Employee
from horilla import horilla_middlewares
from leave.models import AvailableLeave, LeaveType
from tourism.models import Tour, TourAttendance, TourSchedule


def _mock_request(user=None):
    """Return a minimal request mock that satisfies Horilla model save() hooks.

    Horilla signals read several request attributes during model saves.
    We set them explicitly so MagicMock doesn't leak truthy stubs into FK assignments.
    """
    req = MagicMock()
    req.user = user if user is not None else AnonymousUser()
    req.session.get.return_value = None
    req.META = {}
    req.employee_candidate = None  # employee/cbv/allocations.py signal guard
    return req


def _make_employee(username, email):
    user = User.objects.create_user(username=username, email=email, password="x")
    return Employee.objects.create(
        employee_user_id=user,
        employee_first_name=username,
        email=email,
        phone="0900000000",
    )


def _make_leave_type():
    lt, _ = LeaveType.objects.get_or_create(
        name="Nghỉ bù Tour / Lễ",
        defaults={
            "payment": "paid",
            "require_approval": "no",
        },
    )
    return lt


def _make_schedule(tour, code, days=2):
    today = datetime.date.today()
    return TourSchedule.objects.create(
        tour=tour,
        schedule_code=code,
        start_date=today,
        end_date=today + datetime.timedelta(days=days - 1),
        status="scheduled",
    )


class TourLeaveSignalTest(TestCase):
    def setUp(self):
        # Patch thread-local request so LeaveType.save() doesn't crash in tests
        horilla_middlewares._thread_locals.request = _mock_request()

        self.emp1 = _make_employee("hdv01", "hdv01@test.com")
        self.emp2 = _make_employee("hdv02", "hdv02@test.com")
        self.leave_type = _make_leave_type()
        self.tour = Tour.objects.create(
            name="Hà Nội - Hạ Long",
            code="HN-HL-01",
            destination="Hạ Long",
        )

    def tearDown(self):
        if hasattr(horilla_middlewares._thread_locals, "request"):
            del horilla_middlewares._thread_locals.request

    def _complete(self, schedule):
        schedule.status = "completed"
        schedule.save()

    # ── happy path ─────────────────────────────────────────────────────────────

    def test_present_days_credited(self):
        """2 present days → employee gets 2 comp-leave days."""
        sched = _make_schedule(self.tour, "TEST-001", days=3)
        today = datetime.date.today()
        TourAttendance.objects.create(tour_schedule=sched, employee=self.emp1, work_date=today, status="present")
        TourAttendance.objects.create(tour_schedule=sched, employee=self.emp1, work_date=today + datetime.timedelta(1), status="present")
        TourAttendance.objects.create(tour_schedule=sched, employee=self.emp1, work_date=today + datetime.timedelta(2), status="absent")

        self._complete(sched)

        al = AvailableLeave.objects.get(employee_id=self.emp1, leave_type_id=self.leave_type)
        self.assertEqual(al.available_days, 2.0)

    def test_multiple_employees_credited_independently(self):
        """Each employee gets their own present-day count."""
        sched = _make_schedule(self.tour, "TEST-002", days=2)
        today = datetime.date.today()
        TourAttendance.objects.create(tour_schedule=sched, employee=self.emp1, work_date=today, status="present")
        TourAttendance.objects.create(tour_schedule=sched, employee=self.emp1, work_date=today + datetime.timedelta(1), status="present")
        TourAttendance.objects.create(tour_schedule=sched, employee=self.emp2, work_date=today, status="present")

        self._complete(sched)

        al1 = AvailableLeave.objects.get(employee_id=self.emp1, leave_type_id=self.leave_type)
        al2 = AvailableLeave.objects.get(employee_id=self.emp2, leave_type_id=self.leave_type)
        self.assertEqual(al1.available_days, 2.0)
        self.assertEqual(al2.available_days, 1.0)

    def test_accumulates_across_tours(self):
        """Days from two separate tours stack on the same AvailableLeave record."""
        today = datetime.date.today()
        for code, delta in [("TEST-003A", 0), ("TEST-003B", 10)]:
            sched = _make_schedule(self.tour, code, days=1)
            TourAttendance.objects.create(
                tour_schedule=sched,
                employee=self.emp1,
                work_date=today + datetime.timedelta(delta),
                status="present",
            )
            self._complete(sched)

        al = AvailableLeave.objects.get(employee_id=self.emp1, leave_type_id=self.leave_type)
        self.assertEqual(al.available_days, 2.0)

    # ── idempotency ─────────────────────────────────────────────────────────────

    def test_no_double_credit_on_resave(self):
        """Re-saving a completed schedule does NOT credit leave twice."""
        sched = _make_schedule(self.tour, "TEST-004", days=1)
        TourAttendance.objects.create(
            tour_schedule=sched,
            employee=self.emp1,
            work_date=datetime.date.today(),
            status="present",
        )
        self._complete(sched)
        sched.refresh_from_db()
        sched.notes = "re-save test"
        sched.save()

        al = AvailableLeave.objects.get(employee_id=self.emp1, leave_type_id=self.leave_type)
        self.assertEqual(al.available_days, 1.0)

    # ── absent-only tour ────────────────────────────────────────────────────────

    def test_no_credit_if_all_absent(self):
        """Tour with zero present days creates no AvailableLeave record."""
        sched = _make_schedule(self.tour, "TEST-005", days=1)
        TourAttendance.objects.create(
            tour_schedule=sched,
            employee=self.emp1,
            work_date=datetime.date.today(),
            status="absent",
        )
        self._complete(sched)

        self.assertFalse(
            AvailableLeave.objects.filter(employee_id=self.emp1, leave_type_id=self.leave_type).exists()
        )
