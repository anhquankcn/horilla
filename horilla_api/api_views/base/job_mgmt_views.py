from django.db.models import Count, Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from base.models import JobPosition, JobRole, Department
from employee.models import EmployeeWorkInformation


class JobPositionListView(APIView):
    """List / Create job positions with aggregated counts."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        dept_id = request.query_params.get("department_id")
        qs = JobPosition.objects.select_related("department_id")
        if dept_id:
            qs = qs.filter(department_id=dept_id)
        qs = qs.annotate(
            role_count=Count("jobrole", distinct=True),
            employee_count=Count(
                "employeeworkinformation",
                filter=Q(employeeworkinformation__employee_id__is_active=True),
                distinct=True,
            ),
        ).order_by("department_id__department", "job_position")
        results = []
        for p in qs:
            results.append(
                {
                    "id": p.id,
                    "job_position": p.job_position,
                    "department_id": p.department_id_id,
                    "department_name": p.department_id.department,
                    "role_count": p.role_count,
                    "employee_count": p.employee_count,
                }
            )
        return Response({"results": results})

    def post(self, request):
        name = (request.data.get("job_position") or "").strip()
        dept_id = request.data.get("department_id")
        if not name or not dept_id:
            return Response({"error": "Thiếu tên vị trí hoặc phòng ban"}, status=400)
        try:
            dept = Department.objects.get(pk=dept_id)
        except Department.DoesNotExist:
            return Response({"error": "Phòng ban không tồn tại"}, status=400)
        if JobPosition.objects.filter(
            job_position__iexact=name, department_id=dept
        ).exists():
            return Response({"error": f"Vị trí '{name}' đã tồn tại trong phòng {dept.department}"}, status=400)
        pos = JobPosition.objects.create(job_position=name, department_id=dept)
        return Response(
            {"id": pos.id, "job_position": pos.job_position, "department_name": dept.department},
            status=201,
        )


class JobPositionDetailView(APIView):
    """Update / Delete a job position."""

    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        try:
            pos = JobPosition.objects.get(pk=pk)
        except JobPosition.DoesNotExist:
            return Response({"error": "Không tìm thấy"}, status=404)
        name = (request.data.get("job_position") or "").strip()
        dept_id = request.data.get("department_id")
        if name:
            pos.job_position = name
        if dept_id:
            try:
                pos.department_id = Department.objects.get(pk=dept_id)
            except Department.DoesNotExist:
                return Response({"error": "Phòng ban không tồn tại"}, status=400)
        pos.save()
        return Response({"id": pos.id, "job_position": pos.job_position})

    def delete(self, request, pk):
        try:
            pos = JobPosition.objects.get(pk=pk)
        except JobPosition.DoesNotExist:
            return Response({"error": "Không tìm thấy"}, status=404)
        roles = JobRole.objects.filter(job_position_id=pos)
        if roles.exists():
            role_names = list(roles.values_list("job_role", flat=True)[:20])
            return Response(
                {
                    "error": "blocked",
                    "message": f"Vị trí đang liên kết {roles.count()} vai trò. Xóa hết vai trò trước.",
                    "linked_roles": role_names,
                },
                status=409,
            )
        pos.delete()
        return Response({"ok": True})


class JobRoleListView(APIView):
    """List / Create job roles, optionally filtered by position."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        pos_id = request.query_params.get("job_position_id")
        qs = JobRole.objects.select_related("job_position_id", "job_position_id__department_id")
        if pos_id:
            qs = qs.filter(job_position_id=pos_id)
        qs = qs.annotate(
            employee_count=Count(
                "employeeworkinformation",
                filter=Q(employeeworkinformation__employee_id__is_active=True),
                distinct=True,
            ),
        ).order_by("job_position_id__job_position", "job_role")
        results = []
        for r in qs:
            results.append(
                {
                    "id": r.id,
                    "job_role": r.job_role,
                    "job_position_id": r.job_position_id_id,
                    "job_position_name": r.job_position_id.job_position,
                    "department_name": r.job_position_id.department_id.department,
                    "employee_count": r.employee_count,
                }
            )
        return Response({"results": results})

    def post(self, request):
        name = (request.data.get("job_role") or "").strip()
        pos_id = request.data.get("job_position_id")
        if not name or not pos_id:
            return Response({"error": "Thiếu tên vai trò hoặc vị trí"}, status=400)
        try:
            pos = JobPosition.objects.get(pk=pos_id)
        except JobPosition.DoesNotExist:
            return Response({"error": "Vị trí không tồn tại"}, status=400)
        if JobRole.objects.filter(job_role__iexact=name, job_position_id=pos).exists():
            return Response({"error": f"Vai trò '{name}' đã tồn tại trong vị trí {pos.job_position}"}, status=400)
        role = JobRole.objects.create(job_role=name, job_position_id=pos)
        return Response(
            {"id": role.id, "job_role": role.job_role, "job_position_name": pos.job_position},
            status=201,
        )


class JobRoleDetailView(APIView):
    """Update / Delete a job role with employee linkage check."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Return linked employees for this role (pre-delete check)."""
        try:
            role = JobRole.objects.get(pk=pk)
        except JobRole.DoesNotExist:
            return Response({"error": "Không tìm thấy"}, status=404)
        links = EmployeeWorkInformation.objects.filter(
            job_role_id=role, employee_id__is_active=True
        ).select_related("employee_id")
        employees = []
        for wi in links[:50]:
            emp = wi.employee_id
            employees.append(
                {
                    "id": emp.id,
                    "name": emp.employee_first_name + " " + (emp.employee_last_name or ""),
                    "badge_id": emp.badge_id or "",
                    "department": str(wi.department_id) if wi.department_id else "",
                }
            )
        return Response(
            {
                "role_id": role.id,
                "job_role": role.job_role,
                "job_position": role.job_position_id.job_position,
                "employee_count": links.count(),
                "employees": employees,
            }
        )

    def put(self, request, pk):
        try:
            role = JobRole.objects.get(pk=pk)
        except JobRole.DoesNotExist:
            return Response({"error": "Không tìm thấy"}, status=404)
        name = (request.data.get("job_role") or "").strip()
        pos_id = request.data.get("job_position_id")
        if name:
            role.job_role = name
        if pos_id:
            try:
                role.job_position_id = JobPosition.objects.get(pk=pos_id)
            except JobPosition.DoesNotExist:
                return Response({"error": "Vị trí không tồn tại"}, status=400)
        role.save()
        return Response({"id": role.id, "job_role": role.job_role})

    def delete(self, request, pk):
        try:
            role = JobRole.objects.get(pk=pk)
        except JobRole.DoesNotExist:
            return Response({"error": "Không tìm thấy"}, status=404)
        force = request.query_params.get("force") == "true"
        links = EmployeeWorkInformation.objects.filter(job_role_id=role)
        if links.exists() and not force:
            return Response(
                {
                    "error": "has_employees",
                    "message": f"Vai trò đang gán cho {links.count()} nhân viên. Dùng GET để xem danh sách, gửi ?force=true để gỡ liên kết và xóa.",
                    "employee_count": links.count(),
                },
                status=409,
            )
        if links.exists():
            links.update(job_role_id=None)
        role.delete()
        return Response({"ok": True})
