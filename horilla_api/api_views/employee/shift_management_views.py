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

from attendance.models import AttendanceValidationCondition, EmployeeShiftPlan, ShiftChangeRequest
from base.models import Department, DepartmentShift, EmployeeShift, EmployeeShiftSchedule, HRMConfig
from employee.models import Employee

try:
    from attendance.models import GraceTime
    _HAS_GRACE_TIME = True
except ImportError:
    _HAS_GRACE_TIME = False


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


class ShiftCRUDView(APIView):
    """CRUD for EmployeeShift definitions (C&B/superuser only) + dept-shift assignment."""

    permission_classes = [IsAuthenticated]

    def _is_hr(self, request):
        if request.user.is_superuser:
            return True
        return _get_scope(request) == "cnb"

    def get(self, request):
        if not self._is_hr(request):
            return Response({"error": "Không có quyền"}, status=403)
        shifts = EmployeeShift.objects.prefetch_related(
            "department_assignments__department",
        ).select_related("grace_time_id").order_by("employee_shift")

        schedule_qs = EmployeeShiftSchedule.objects.select_related("day", "shift_id")
        schedule_map: dict = {}
        for sch in schedule_qs:
            schedule_map.setdefault(sch.shift_id_id, []).append(sch)

        result = []
        for s in shifts:
            schedules_raw = schedule_map.get(s.id, [])
            schedule_data = []
            for sch in schedules_raw:
                start = sch.start_time
                end = sch.end_time
                blocks = None
                if start and end:
                    start_dt = datetime.combine(datetime.today(), start)
                    end_dt = datetime.combine(datetime.today(), end)
                    if end_dt <= start_dt:
                        end_dt += timedelta(days=1)
                    blocks = int((end_dt - start_dt).total_seconds() / 900)
                schedule_data.append({
                    "day": sch.day.day if sch.day else "",
                    "start_time": start.strftime("%H:%M") if start else None,
                    "end_time": end.strftime("%H:%M") if end else None,
                    "blocks": blocks,
                    "minimum_working_hour": sch.minimum_working_hour,
                    "is_night_shift": sch.is_night_shift,
                })

            grace = s.grace_time_id
            grace_data = None
            if grace:
                grace_data = {
                    "allowed_time": grace.allowed_time,
                    "allowed_min": round(grace.allowed_time_in_secs / 60),
                    "clock_in": grace.allowed_clock_in,
                    "clock_out": grace.allowed_clock_out,
                }

            result.append({
                "id": s.id,
                "name": s.employee_shift,
                "weekly_full_time": s.weekly_full_time,
                "department_ids": list(s.department_assignments.values_list("department_id", flat=True)),
                "department_names": list(s.department_assignments.values_list("department__department", flat=True)),
                "schedules": schedule_data,
                "grace_time": grace_data,
            })
        depts = list(Department.objects.values("id", "department").order_by("department"))
        return Response({"shifts": result, "departments": depts})

    def post(self, request):
        if not self._is_hr(request):
            return Response({"error": "Không có quyền"}, status=403)
        action = request.data.get("action", "create_shift")

        if action == "create_shift":
            name = request.data.get("name", "").strip()
            if not name:
                return Response({"error": "Tên ca không được để trống"}, status=400)
            if EmployeeShift.objects.filter(employee_shift=name).exists():
                return Response({"error": "Ca này đã tồn tại"}, status=400)
            shift = EmployeeShift.objects.create(
                employee_shift=name,
                weekly_full_time=float(request.data.get("weekly_full_time") or 40),
            )
            return Response({"ok": True, "id": shift.id, "name": shift.employee_shift}, status=201)

        if action == "update_shift":
            shift_id = request.data.get("shift_id")
            try:
                shift = EmployeeShift.objects.get(id=shift_id)
            except EmployeeShift.DoesNotExist:
                return Response({"error": "Không tìm thấy ca"}, status=404)
            if "name" in request.data:
                shift.employee_shift = request.data["name"].strip()
            if "weekly_full_time" in request.data:
                shift.weekly_full_time = float(request.data["weekly_full_time"] or 40)
            shift.save()
            return Response({"ok": True})

        if action == "delete_shift":
            shift_id = request.data.get("shift_id")
            try:
                shift = EmployeeShift.objects.get(id=shift_id)
                shift.delete()
                return Response({"ok": True})
            except EmployeeShift.DoesNotExist:
                return Response({"error": "Không tìm thấy ca"}, status=404)
            except Exception as e:
                return Response({"error": f"Không thể xóa: {e}"}, status=400)

        if action == "assign_dept":
            dept_id = request.data.get("department_id")
            shift_id = request.data.get("shift_id")
            obj, created = DepartmentShift.objects.get_or_create(
                department_id=dept_id, shift_id=shift_id
            )
            return Response({"ok": True, "created": created})

        if action == "remove_dept":
            dept_id = request.data.get("department_id")
            shift_id = request.data.get("shift_id")
            DepartmentShift.objects.filter(department_id=dept_id, shift_id=shift_id).delete()
            return Response({"ok": True})

        return Response({"error": "action không hợp lệ"}, status=400)


class ShiftPlannerView(APIView):
    """
    Monthly shift planner grid for employee self-assign + manager direct assign.

    GET  ?month=YYYY-MM&dept_id=N
    POST {employee_id, shift_id, date, copy_scope: 1day|this_week|next_week|this_month}
    PATCH {action: approve|reject, request_id, copy_scope?}
    DELETE {plan_id?, request_id?}
    """

    permission_classes = [IsAuthenticated]

    def _get_emp(self, request):
        try:
            return request.user.employee_get
        except Exception:
            return None

    def _is_hr(self, request):
        return request.user.is_superuser or _get_scope(request) == "cnb"

    def _is_manager_of(self, mgr_emp, emp_id):
        return Employee.objects.filter(
            id=emp_id,
            employee_work_info__reporting_manager_id=mgr_emp,
        ).exists()

    def _plan_dates(self, base_date, copy_scope):
        if copy_scope == "this_week":
            monday = base_date - timedelta(days=base_date.weekday())
            return [monday + timedelta(days=i) for i in range(7)]
        if copy_scope == "next_week":
            days_ahead = 7 - base_date.weekday()
            monday = base_date + timedelta(days=days_ahead)
            return [monday + timedelta(days=i) for i in range(7)]
        if copy_scope == "this_month":
            last = calendar.monthrange(base_date.year, base_date.month)[1]
            return [date(base_date.year, base_date.month, d) for d in range(1, last + 1)]
        return [base_date]

    def _emp_row(self, emp, request):
        wi = getattr(emp, "employee_work_info", None)
        dept = getattr(wi, "department_id", None) if wi else None
        avatar_url = None
        if emp.employee_profile:
            try:
                avatar_url = request.build_absolute_uri(emp.employee_profile.url)
            except Exception:
                pass
        return {
            "id": emp.id,
            "name": emp.get_full_name(),
            "badge_id": emp.badge_id or "",
            "department_id": dept.id if dept else None,
            "department_name": dept.department if dept else "",
            "avatar": avatar_url,
        }

    def get(self, request):
        me = self._get_emp(request)
        if not me:
            return Response({"error": "No employee"}, status=400)

        month_str = request.query_params.get("month", "")
        dept_id = request.query_params.get("dept_id", "")
        try:
            if month_str:
                dt = datetime.strptime(month_str, "%Y-%m")
                year, month_num = dt.year, dt.month
            else:
                today = date.today()
                year, month_num = today.year, today.month
        except ValueError:
            return Response({"error": "month phải có dạng YYYY-MM"}, status=400)

        last_day = calendar.monthrange(year, month_num)[1]
        from_date = date(year, month_num, 1)
        to_date = date(year, month_num, last_day)

        is_hr = self._is_hr(request)
        managed_ids = list(
            Employee.objects.filter(
                employee_work_info__reporting_manager_id=me, is_active=True
            ).values_list("id", flat=True)
        )
        is_manager = len(managed_ids) > 0

        if is_hr:
            base_qs = Employee.objects.filter(is_active=True)
            if dept_id:
                base_qs = base_qs.filter(employee_work_info__department_id=dept_id)
        elif is_manager:
            base_qs = Employee.objects.filter(id__in=managed_ids)
            if dept_id:
                base_qs = base_qs.filter(employee_work_info__department_id=dept_id)
        else:
            base_qs = Employee.objects.filter(id=me.id)

        emp_qs = base_qs.select_related(
            "employee_work_info__department_id",
            "employee_work_info__shift_id",
        ).order_by("employee_first_name", "employee_last_name")

        employees = [self._emp_row(e, request) for e in emp_qs]
        emp_ids = [e["id"] for e in employees]

        plans = EmployeeShiftPlan.objects.filter(
            employee_id__in=emp_ids, date__gte=from_date, date__lte=to_date
        ).select_related("shift")
        plan_map = {}
        for p in plans:
            key = f"{p.employee_id}_{p.date}"
            plan_map[key] = {
                "plan_id": p.id, "shift_id": p.shift_id,
                "shift_name": p.shift.employee_shift,
            }

        reqs = ShiftChangeRequest.objects.filter(
            employee_id__in=emp_ids, date__gte=from_date, date__lte=to_date,
        ).select_related("shift", "requested_by")
        req_map = {}
        for r in reqs:
            key = f"{r.employee_id}_{r.date}"
            req_map[key] = {
                "request_id": r.id, "shift_id": r.shift_id,
                "shift_name": r.shift.employee_shift,
                "status": r.status,
                "requested_by_id": r.requested_by_id,
            }

        pending_reqs = [
            {
                "id": r.id,
                "employee_id": r.employee_id,
                "employee_name": r.employee.get_full_name() if r.employee else "",
                "shift_id": r.shift_id,
                "shift_name": r.shift.employee_shift,
                "date": str(r.date),
                "note": r.note or "",
            }
            for r in reqs if r.status == "pending"
        ]

        dates = [str(date(year, month_num, d)) for d in range(1, last_day + 1)]

        dept_ids_set = {e["department_id"] for e in employees if e["department_id"]}
        depts = list(Department.objects.filter(id__in=dept_ids_set).values("id", "department").order_by("department"))

        if is_hr or is_manager:
            all_depts = list(Department.objects.values("id", "department").order_by("department"))
        else:
            all_depts = depts

        dept_shifts: dict = {}
        for ds in DepartmentShift.objects.all():
            dept_shifts.setdefault(ds.department_id, []).append(ds.shift_id)

        all_shifts = [{"id": s.id, "name": s.employee_shift}
                      for s in EmployeeShift.objects.order_by("employee_shift")]

        return Response({
            "year": year,
            "month": month_num,
            "days": dates,
            "employees": employees,
            "plans": plan_map,
            "requests": req_map,
            "pending_requests": pending_reqs,
            "is_manager": is_manager or is_hr,
            "is_hr": is_hr,
            "departments": all_depts,
            "all_shifts": all_shifts,
            "dept_shifts": dept_shifts,
        })

    def post(self, request):
        me = self._get_emp(request)
        if not me:
            return Response({"error": "No employee"}, status=400)

        emp_id = request.data.get("employee_id")
        shift_id = request.data.get("shift_id")
        date_str = request.data.get("date", "")
        copy_scope = request.data.get("copy_scope", "1day")

        if not emp_id or not shift_id or not date_str:
            return Response({"error": "Thiếu employee_id, shift_id hoặc date"}, status=400)
        try:
            base_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Định dạng ngày không hợp lệ"}, status=400)

        emp_id = int(emp_id)
        is_manager = self._is_manager_of(me, emp_id)
        is_hr = self._is_hr(request)
        is_self = (me.id == emp_id)

        if not is_manager and not is_hr and not is_self:
            return Response({"error": "Không có quyền phân ca"}, status=403)

        dates = self._plan_dates(base_date, copy_scope)
        created_plans = 0
        created_reqs = 0

        for d in dates:
            if is_manager or is_hr:
                existing = EmployeeShiftPlan.objects.filter(employee_id=emp_id, date=d)
                if existing.count() >= 3 or existing.filter(shift_id=shift_id).exists():
                    continue
                EmployeeShiftPlan.objects.create(
                    employee_id=emp_id, shift_id=shift_id, date=d, created_by=me
                )
                created_plans += 1
            else:
                if ShiftChangeRequest.objects.filter(
                    employee_id=emp_id, shift_id=shift_id, date=d, status="pending"
                ).exists():
                    continue
                ShiftChangeRequest.objects.create(
                    employee_id=emp_id, shift_id=shift_id, date=d,
                    status="pending", requested_by=me,
                )
                created_reqs += 1

        return Response({
            "ok": True,
            "plans_created": created_plans,
            "requests_created": created_reqs,
        }, status=201)

    def patch(self, request):
        me = self._get_emp(request)
        if not me:
            return Response({"error": "No employee"}, status=400)

        action = request.data.get("action")
        request_id = request.data.get("request_id")
        copy_scope = request.data.get("copy_scope", "1day")

        if action not in ("approve", "reject"):
            return Response({"error": "action phải là approve hoặc reject"}, status=400)
        if not request_id:
            return Response({"error": "Thiếu request_id"}, status=400)

        try:
            req = ShiftChangeRequest.objects.select_related("employee", "shift").get(
                id=request_id, status="pending"
            )
        except ShiftChangeRequest.DoesNotExist:
            return Response({"error": "Không tìm thấy yêu cầu chờ duyệt"}, status=404)

        if not self._is_manager_of(me, req.employee_id) and not self._is_hr(request):
            return Response({"error": "Không có quyền duyệt"}, status=403)

        dates = self._plan_dates(req.date, copy_scope)
        req.status = "approved" if action == "approve" else "rejected"
        req.approved_by = me
        req.save()

        if action == "approve":
            for d in dates:
                existing = EmployeeShiftPlan.objects.filter(employee_id=req.employee_id, date=d)
                if existing.count() < 3 and not existing.filter(shift_id=req.shift_id).exists():
                    EmployeeShiftPlan.objects.create(
                        employee_id=req.employee_id, shift_id=req.shift_id, date=d, created_by=me
                    )
                if d != req.date:
                    ShiftChangeRequest.objects.filter(
                        employee_id=req.employee_id, shift_id=req.shift_id,
                        date=d, status="pending",
                    ).update(status="approved", approved_by=me)

        return Response({"ok": True, "status": req.status})

    def delete(self, request):
        me = self._get_emp(request)
        if not me:
            return Response({"error": "No employee"}, status=400)

        plan_id = request.data.get("plan_id")
        request_id = request.data.get("request_id")
        is_hr = self._is_hr(request)

        if plan_id:
            qs = EmployeeShiftPlan.objects.filter(id=plan_id)
            if not is_hr:
                mgr_ids = _manager_dept_ids(request)
                qs = qs.filter(employee__employee_work_info__department_id__in=mgr_ids)
            count, _ = qs.delete()
            return Response({"deleted": count})

        if request_id:
            qs = ShiftChangeRequest.objects.filter(id=request_id)
            if not is_hr:
                qs = qs.filter(requested_by=me)
            count, _ = qs.delete()
            return Response({"deleted": count})

        return Response({"error": "Cần plan_id hoặc request_id"}, status=400)


# ── AttendanceConfigView ──────────────────────────────────────────────────────

_LATE_EARLY_KEYS = {
    "late_come_enabled": bool,
    "early_out_enabled": bool,
    "late_early_deduct_leave": bool,
}


def _grace_time_data(g) -> dict:
    secs = g.allowed_time_in_secs or 0
    return {
        "id": g.id,
        "allowed_time": g.allowed_time,
        "allowed_min": round(secs / 60),
        "clock_in": g.allowed_clock_in,
        "clock_out": g.allowed_clock_out,
        "is_default": g.is_default,
    }


def _validation_condition_data(vc) -> dict:
    return {
        "id": vc.id,
        "validation_at_work": vc.validation_at_work,
        "minimum_overtime_to_approve": vc.minimum_overtime_to_approve or "",
        "overtime_cutoff": vc.overtime_cutoff or "",
        "auto_approve_ot": vc.auto_approve_ot,
    }


class AttendanceConfigView(APIView):
    """
    GET  /api/employee/attendance-config/
         → validation_condition, grace_times, late_early_config

    PATCH section='validation' → update AttendanceValidationCondition (singleton)
    PATCH section='late_early' → update HRMConfig late-early keys

    POST  section='grace_time', action=create|update|delete|set_default → GraceTime CRUD
    """

    permission_classes = [IsAuthenticated]

    def _is_hr(self, request) -> bool:
        return request.user.is_superuser or request.user.has_perm("attendance.change_attendance")

    # ── GET ──────────────────────────────────────────────────────────────────

    def get(self, request):
        if not self._is_hr(request):
            return Response({"error": "Không có quyền"}, status=403)

        vc_qs = AttendanceValidationCondition.objects.first()
        validation_condition = _validation_condition_data(vc_qs) if vc_qs else None

        grace_times = []
        if _HAS_GRACE_TIME:
            grace_times = [_grace_time_data(g) for g in GraceTime.objects.order_by("-is_default", "allowed_time")]

        late_early_config = {
            k: HRMConfig.get_value(k, True if k in ("late_come_enabled", "early_out_enabled") else False)
            for k in _LATE_EARLY_KEYS
        }

        return Response({
            "validation_condition": validation_condition,
            "grace_times": grace_times,
            "late_early_config": late_early_config,
        })

    # ── PATCH ─────────────────────────────────────────────────────────────────

    def patch(self, request):
        if not self._is_hr(request):
            return Response({"error": "Không có quyền"}, status=403)

        section = request.data.get("section")

        if section == "validation":
            vc, _ = AttendanceValidationCondition.objects.get_or_create(pk=1)
            if "validation_at_work" in request.data:
                vc.validation_at_work = request.data["validation_at_work"]
            if "minimum_overtime_to_approve" in request.data:
                vc.minimum_overtime_to_approve = request.data["minimum_overtime_to_approve"] or None
            if "overtime_cutoff" in request.data:
                vc.overtime_cutoff = request.data["overtime_cutoff"] or None
            if "auto_approve_ot" in request.data:
                vc.auto_approve_ot = bool(request.data["auto_approve_ot"])
            vc.save()
            return Response(_validation_condition_data(vc))

        if section == "late_early":
            for key, cast in _LATE_EARLY_KEYS.items():
                if key in request.data:
                    HRMConfig.set_value(key, cast(request.data[key]))
            return Response({"ok": True})

        return Response({"error": "section không hợp lệ"}, status=400)

    # ── POST (GraceTime CRUD) ─────────────────────────────────────────────────

    def post(self, request):
        if not self._is_hr(request):
            return Response({"error": "Không có quyền"}, status=403)
        if not _HAS_GRACE_TIME:
            return Response({"error": "GraceTime không khả dụng"}, status=400)

        action = request.data.get("action")

        if action == "create_grace":
            mins = int(request.data.get("allowed_min", 0))
            secs = mins * 60
            h, m, s = secs // 3600, (secs % 3600) // 60, secs % 60
            g = GraceTime.objects.create(
                allowed_time=f"{h:02d}:{m:02d}:{s:02d}",
                allowed_time_in_secs=secs,
                allowed_clock_in=bool(request.data.get("clock_in", True)),
                allowed_clock_out=bool(request.data.get("clock_out", False)),
                is_default=False,
            )
            return Response(_grace_time_data(g), status=201)

        if action == "update_grace":
            gid = request.data.get("grace_id")
            try:
                g = GraceTime.objects.get(id=gid)
            except GraceTime.DoesNotExist:
                return Response({"error": "Không tìm thấy grace time"}, status=404)
            if "allowed_min" in request.data:
                mins = int(request.data["allowed_min"])
                secs = mins * 60
                h, m, s = secs // 3600, (secs % 3600) // 60, secs % 60
                g.allowed_time = f"{h:02d}:{m:02d}:{s:02d}"
                g.allowed_time_in_secs = secs
            if "clock_in" in request.data:
                g.allowed_clock_in = bool(request.data["clock_in"])
            if "clock_out" in request.data:
                g.allowed_clock_out = bool(request.data["clock_out"])
            g.save()
            return Response(_grace_time_data(g))

        if action == "delete_grace":
            gid = request.data.get("grace_id")
            count, _ = GraceTime.objects.filter(id=gid, is_default=False).delete()
            if count == 0:
                return Response({"error": "Không thể xoá grace time mặc định hoặc không tồn tại"}, status=400)
            return Response({"ok": True})

        if action == "set_default_grace":
            gid = request.data.get("grace_id")
            GraceTime.objects.update(is_default=False)
            GraceTime.objects.filter(id=gid).update(is_default=True)
            return Response({"ok": True})

        return Response({"error": "action không hợp lệ"}, status=400)
