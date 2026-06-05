"""
Shift Management API views.

Permission scope:
  'cnb'     — Chuyên viên C&B: manage all depts + configure dept-shift assignments
  'manager' — Quản lý Ca: manage employees in own department(s) only
"""
import calendar
from datetime import date, datetime, timedelta

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from attendance.models import EmployeeShiftPlan
from base.models import Department, DepartmentShift, EmployeeShift
from employee.models import Employee


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_scope(request):
    """Return 'cnb', 'manager', or None."""
    user = request.user
    if user.is_superuser:
        return "cnb"
    gnames = [g.name.lower() for g in user.groups.all()]
    if any(
        "c&b" in g or "c & b" in g or "chuyên viên c" in g or "cb" == g.strip()
        for g in gnames
    ):
        return "cnb"
    if any("quản lý ca" in g or "shift manager" in g for g in gnames):
        return "manager"
    try:
        emp = user.employee_get
        if Employee.objects.filter(
            employee_work_info__reporting_manager_id=emp, is_active=True
        ).exists():
            return "manager"
    except Exception:
        pass
    return None


def _manager_dept_ids(request):
    """Dept IDs the current user directly manages (as reporting manager)."""
    try:
        emp = request.user.employee_get
        return list(
            Employee.objects.filter(
                employee_work_info__reporting_manager_id=emp,
                is_active=True,
            )
            .values_list("employee_work_info__department_id", flat=True)
            .distinct()
        )
    except Exception:
        return []


def _compute_dates(scope: str, base_date: date, weekdays: list) -> list:
    """Compute the list of dates for a given time scope."""
    if scope == "1day":
        return [base_date]

    if scope == "weekdays":
        result = []
        for i in range(7):
            d = base_date + timedelta(days=i)
            if d.weekday() in weekdays:
                result.append(d)
        return result

    if scope == "next_week":
        days_ahead = 7 - base_date.weekday()
        monday = base_date + timedelta(days=days_ahead)
        return [monday + timedelta(days=i) for i in range(7)]

    if scope == "next_month":
        if base_date.month == 12:
            nm = date(base_date.year + 1, 1, 1)
        else:
            nm = date(base_date.year, base_date.month + 1, 1)
        last = calendar.monthrange(nm.year, nm.month)[1]
        return [date(nm.year, nm.month, d) for d in range(1, last + 1)]

    return []


# ── views ─────────────────────────────────────────────────────────────────────

class ShiftMgmtScopeView(APIView):
    """Return current user's permission scope and managed dept IDs."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = _get_scope(request)
        dept_ids = _manager_dept_ids(request) if scope == "manager" else []
        return Response({"scope": scope or "none", "department_ids": dept_ids})


class ShiftMgmtShiftsView(APIView):
    """All company shifts with schedule summary and dept assignments."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = _get_scope(request)
        if not scope:
            return Response([])

        shifts = EmployeeShift.objects.prefetch_related(
            "employeeshiftschedule_set__day",
            "department_assignments__department",
        ).all()

        result = []
        for s in shifts:
            schedules = sorted(
                s.employeeshiftschedule_set.all(),
                key=lambda x: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].index(
                    x.day.day.lower()
                ) if x.day.day.lower() in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] else 7,
            )
            dept_ids = list(s.department_assignments.values_list("department_id", flat=True))
            result.append({
                "id": s.id,
                "name": s.employee_shift,
                "weekly_full_time": s.weekly_full_time,
                "department_ids": dept_ids,
                "schedules": [
                    {
                        "day": sch.day.day,
                        "start_time": str(sch.start_time)[:5] if sch.start_time else None,
                        "end_time": str(sch.end_time)[:5] if sch.end_time else None,
                        "is_night_shift": sch.is_night_shift,
                    }
                    for sch in schedules
                ],
            })
        return Response(result)


class ShiftMgmtDeptShiftView(APIView):
    """Configure which shifts are assigned to which departments (C&B only for write)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = _get_scope(request)
        if not scope:
            return Response([])

        depts = Department.objects.prefetch_related("active_shifts__shift").all()
        if scope == "manager":
            mgr_ids = _manager_dept_ids(request)
            depts = depts.filter(id__in=mgr_ids)

        result = [
            {
                "id": d.id,
                "name": d.department,
                "shift_ids": list(d.active_shifts.values_list("shift_id", flat=True)),
            }
            for d in depts
        ]
        return Response(result)

    def post(self, request):
        """Assign shift to department. Body: {department_id, shift_id}"""
        if _get_scope(request) != "cnb":
            return Response({"error": "Không có quyền"}, status=403)
        dept_id = request.data.get("department_id")
        shift_id = request.data.get("shift_id")
        if not dept_id or not shift_id:
            return Response({"error": "Thiếu department_id hoặc shift_id"}, status=400)
        obj, created = DepartmentShift.objects.get_or_create(
            department_id=dept_id, shift_id=shift_id
        )
        return Response({"created": created, "id": obj.id})

    def delete(self, request):
        """Remove shift from department. Body: {department_id, shift_id}"""
        if _get_scope(request) != "cnb":
            return Response({"error": "Không có quyền"}, status=403)
        dept_id = request.data.get("department_id")
        shift_id = request.data.get("shift_id")
        DepartmentShift.objects.filter(department_id=dept_id, shift_id=shift_id).delete()
        return Response({"ok": True})


class ShiftMgmtEmployeesView(APIView):
    """Employees the user can manage, optionally filtered by department."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = _get_scope(request)
        if not scope:
            return Response([])

        dept_id = request.query_params.get("department_id")
        qs = Employee.objects.filter(is_active=True).select_related(
            "employee_work_info__shift_id",
            "employee_work_info__department_id",
        )

        if scope == "manager":
            mgr_ids = _manager_dept_ids(request)
            qs = qs.filter(employee_work_info__department_id__in=mgr_ids)

        if dept_id:
            qs = qs.filter(employee_work_info__department_id=dept_id)

        result = []
        for emp in qs.order_by("employee_first_name", "employee_last_name"):
            wi = getattr(emp, "employee_work_info", None)
            dept = wi.department_id if wi else None
            shift = wi.shift_id if wi else None
            avatar_url = None
            if emp.employee_profile:
                try:
                    avatar_url = request.build_absolute_uri(emp.employee_profile.url)
                except Exception:
                    pass
            result.append({
                "id": emp.id,
                "name": emp.get_full_name(),
                "badge_id": emp.badge_id or "",
                "department_id": dept.id if dept else None,
                "department_name": dept.department if dept else "",
                "shift_id": shift.id if shift else None,
                "shift_name": shift.employee_shift if shift else "",
                "avatar": avatar_url,
            })
        return Response(result)


class ShiftMgmtPlanView(APIView):
    """Read and write EmployeeShiftPlan records."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Params: from_date (YYYY-MM-DD), to_date (YYYY-MM-DD), department_id (optional)
        Returns list of shift plan entries in range.
        """
        scope = _get_scope(request)
        if not scope:
            return Response([])

        from_str = request.query_params.get("from_date")
        to_str = request.query_params.get("to_date")
        dept_id = request.query_params.get("department_id")

        if not from_str or not to_str:
            return Response({"error": "from_date và to_date là bắt buộc"}, status=400)
        try:
            from_date = datetime.strptime(from_str, "%Y-%m-%d").date()
            to_date = datetime.strptime(to_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Định dạng ngày không hợp lệ (YYYY-MM-DD)"}, status=400)

        qs = EmployeeShiftPlan.objects.filter(
            date__gte=from_date, date__lte=to_date
        ).select_related("employee", "shift").prefetch_related("shift__employeeshiftschedule_set")

        if scope == "manager":
            mgr_ids = _manager_dept_ids(request)
            qs = qs.filter(employee__employee_work_info__department_id__in=mgr_ids)
        if dept_id:
            qs = qs.filter(employee__employee_work_info__department_id=dept_id)

        def _start_time(plan):
            day_name = plan.date.strftime("%A").lower()
            for sch in plan.shift.employeeshiftschedule_set.all():
                if sch.day.day.lower() == day_name and sch.start_time:
                    return str(sch.start_time)[:5]
            for sch in plan.shift.employeeshiftschedule_set.all():
                if sch.start_time:
                    return str(sch.start_time)[:5]
            return "00:00"

        return Response([
            {
                "id": p.id,
                "employee_id": p.employee_id,
                "shift_id": p.shift_id,
                "shift_name": p.shift.employee_shift,
                "date": str(p.date),
                "start_time": _start_time(p),
            }
            for p in qs
        ])

    def post(self, request):
        """
        Assign a single shift to one employee on one date (max 3 shifts/day).
        Body: {employee_id: int, shift_id: int, date: 'YYYY-MM-DD'}
        """
        scope = _get_scope(request)
        if not scope:
            return Response({"error": "Không có quyền"}, status=403)

        emp_id = request.data.get("employee_id")
        shift_id = request.data.get("shift_id")
        date_str = request.data.get("date")

        if not emp_id or not shift_id or not date_str:
            return Response({"error": "Thiếu employee_id, shift_id hoặc date"}, status=400)

        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Định dạng ngày không hợp lệ"}, status=400)

        emp_qs = Employee.objects.filter(id=emp_id, is_active=True)
        if scope == "manager":
            mgr_ids = _manager_dept_ids(request)
            emp_qs = emp_qs.filter(employee_work_info__department_id__in=mgr_ids)
        if not emp_qs.exists():
            return Response({"error": "Không tìm thấy nhân viên hoặc không có quyền"}, status=403)

        existing = EmployeeShiftPlan.objects.filter(employee_id=emp_id, date=target_date)
        if existing.count() >= 3:
            return Response({"error": "Tối đa 3 ca mỗi ngày"}, status=400)
        if existing.filter(shift_id=shift_id).exists():
            return Response({"error": "Ca này đã được phân cho ngày đó"}, status=400)

        try:
            creator = request.user.employee_get
        except Exception:
            creator = None

        plan = EmployeeShiftPlan.objects.create(
            employee_id=emp_id,
            shift_id=shift_id,
            date=target_date,
            created_by=creator,
        )
        return Response({"id": plan.id, "created": True}, status=201)

    def delete(self, request):
        """
        Remove a single shift plan by ID. Body: {plan_id: int}
        """
        scope = _get_scope(request)
        if not scope:
            return Response({"error": "Không có quyền"}, status=403)

        plan_id = request.data.get("plan_id")
        if not plan_id:
            return Response({"error": "Thiếu plan_id"}, status=400)

        qs = EmployeeShiftPlan.objects.filter(id=plan_id)
        if scope == "manager":
            mgr_ids = _manager_dept_ids(request)
            qs = qs.filter(employee__employee_work_info__department_id__in=mgr_ids)

        count, _ = qs.delete()
        if count == 0:
            return Response({"error": "Không tìm thấy hoặc không có quyền"}, status=404)
        return Response({"deleted": count})
