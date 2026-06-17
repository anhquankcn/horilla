"""HNH Core — M2M API endpoints for external systems.

Data pull endpoints gated by scope. Admin CRUD for service accounts
gated by is_superuser or Admin Hệ thống group.
"""

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from base.models import IntegrationConfig, M2MServiceAccount
from rest_framework.pagination import PageNumberPagination

from employee.models import Employee, EmployeeWorkInformation


class M2MPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 500
from horilla_api.m2m_auth import M2MAuthentication, require_m2m_scope

AVAILABLE_SCOPES = [
    ("employee:read", "Đọc danh sách nhân viên, hồ sơ cá nhân"),
    ("attendance:read", "Đọc dữ liệu chấm công"),
    ("attendance:write", "Ghi lượt chấm công (máy chấm công Ronald Jack)"),
    ("leave:read", "Đọc số dư nghỉ phép"),
    ("payroll:read", "Đọc dữ liệu lương"),
    ("embed:login", "Nhúng UI với SSO handoff"),
    ("*", "Full access — tất cả scope"),
]

ADMIN_GROUP = "Admin Hệ thống"


def _is_admin(user):
    return user.is_superuser or user.groups.filter(name=ADMIN_GROUP).exists()


# ─── M2M Data Endpoints ─────────────────────────────────────────────

class WhoAmIView(APIView):
    """GET: Verify token + show account info. No scope required."""
    authentication_classes = [M2MAuthentication]
    permission_classes = []

    def get(self, request):
        account = getattr(request, "m2m_account", None)
        if not account:
            return Response({"ok": False, "error": "Not authenticated"}, status=401)
        return Response({
            "ok": True,
            "service_account": account.slug,
            "name": account.name,
            "scopes": account.scopes,
            "status": account.status,
        })


class M2MEmployeeListView(APIView):
    """GET: List employees with basic info."""
    authentication_classes = [M2MAuthentication]
    permission_classes = [require_m2m_scope("employee:read")]
    required_scope = "employee:read"

    def get(self, request):
        qs = Employee.objects.filter(is_active=True).select_related(
            "employee_work_info__department_id",
            "employee_work_info__job_position_id",
            "employee_work_info__reporting_manager_id",
        )

        dept = request.query_params.get("department")
        if dept:
            qs = qs.filter(employee_work_info__department_id=dept)

        email = request.query_params.get("email")
        if email:
            qs = qs.filter(email=email)

        search = request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(employee_first_name__icontains=search)
                | Q(employee_last_name__icontains=search)
                | Q(email__icontains=search)
                | Q(badge_id__icontains=search)
            )

        paginator = M2MPagination()
        page = paginator.paginate_queryset(qs, request)
        results = []
        for emp in page:
            wi = getattr(emp, "employee_work_info", None)
            results.append({
                "id": emp.id,
                "badge_id": emp.badge_id or "",
                "first_name": emp.employee_first_name,
                "last_name": emp.employee_last_name,
                "email": emp.email or "",
                "phone": emp.phone or "",
                "department": str(wi.department_id) if wi and wi.department_id else None,
                "job_position": str(wi.job_position_id) if wi and wi.job_position_id else None,
                "reporting_manager": str(wi.reporting_manager_id) if wi and wi.reporting_manager_id else None,
                "is_active": emp.is_active,
            })
        return paginator.get_paginated_response(results)


class M2MEmployeeDetailView(APIView):
    """GET: Single employee by ID or email."""
    authentication_classes = [M2MAuthentication]
    permission_classes = [require_m2m_scope("employee:read")]
    required_scope = "employee:read"

    def get(self, request, pk):
        try:
            emp = Employee.objects.select_related(
                "employee_work_info__department_id",
                "employee_work_info__job_position_id",
            ).get(pk=pk, is_active=True)
        except Employee.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        wi = getattr(emp, "employee_work_info", None)
        return Response({
            "id": emp.id,
            "badge_id": emp.badge_id or "",
            "first_name": emp.employee_first_name,
            "last_name": emp.employee_last_name,
            "email": emp.email or "",
            "phone": emp.phone or "",
            "gender": emp.gender or "",
            "department": str(wi.department_id) if wi and wi.department_id else None,
            "job_position": str(wi.job_position_id) if wi and wi.job_position_id else None,
            "reporting_manager": str(wi.reporting_manager_id) if wi and wi.reporting_manager_id else None,
            "date_joining": wi.date_joining.isoformat() if wi and wi.date_joining else None,
        })


class M2MAttendanceView(APIView):
    """GET: Attendance records for a date range."""
    authentication_classes = [M2MAuthentication]
    permission_classes = [require_m2m_scope("attendance:read")]
    required_scope = "attendance:read"

    def get(self, request):
        from attendance.models import Attendance

        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if not date_from or not date_to:
            return Response({"error": "date_from and date_to required"}, status=400)

        qs = Attendance.objects.filter(
            attendance_date__gte=date_from,
            attendance_date__lte=date_to,
        ).select_related("employee_id")[:500]

        results = [{
            "employee_id": a.employee_id_id,
            "employee_name": str(a.employee_id),
            "date": a.attendance_date.isoformat(),
            "clock_in": str(a.attendance_clock_in) if a.attendance_clock_in else None,
            "clock_out": str(a.attendance_clock_out) if a.attendance_clock_out else None,
            "worked_hour": str(a.attendance_worked_hour) if a.attendance_worked_hour else None,
            "status": a.attendance_validated if hasattr(a, "attendance_validated") else None,
        } for a in qs]

        return Response({"count": len(results), "results": results})


class M2MLeaveBalanceView(APIView):
    """GET: Leave balances for all employees (or filtered)."""
    authentication_classes = [M2MAuthentication]
    permission_classes = [require_m2m_scope("leave:read")]
    required_scope = "leave:read"

    def get(self, request):
        from leave.models import AvailableLeave

        qs = AvailableLeave.objects.select_related(
            "employee_id", "leave_type_id"
        ).filter(employee_id__is_active=True)

        emp_id = request.query_params.get("employee_id")
        if emp_id:
            qs = qs.filter(employee_id=emp_id)

        results = [{
            "employee_id": al.employee_id_id,
            "employee_name": str(al.employee_id),
            "leave_type": str(al.leave_type_id),
            "available_days": float(al.available_days),
            "carryforward_days": float(al.carryforward_days) if hasattr(al, "carryforward_days") else 0,
            "total_leave_days": float(al.total_leave_days) if hasattr(al, "total_leave_days") else 0,
        } for al in qs[:500]]

        return Response({"count": len(results), "results": results})


class M2MScopesListView(APIView):
    """GET: List all available scopes (for admin UI)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Admin only"}, status=403)
        return Response({"scopes": [{"code": s[0], "description": s[1]} for s in AVAILABLE_SCOPES]})


# ─── Admin CRUD for Service Accounts ─────────────────────────────────

class ServiceAccountAdminView(APIView):
    """GET: List accounts. POST: Create new account (returns token once)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Admin only"}, status=403)
        accounts = M2MServiceAccount.objects.all()
        return Response({"results": [{
            "id": a.id,
            "name": a.name,
            "slug": a.slug,
            "description": a.description,
            "token_prefix": a.token_prefix,
            "scopes": a.scopes,
            "allowed_cidrs": a.allowed_cidrs,
            "status": a.status,
            "created_at": a.created_at.isoformat(),
            "last_used_at": a.last_used_at.isoformat() if a.last_used_at else None,
            "last_used_ip": a.last_used_ip,
        } for a in accounts]})

    def post(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Admin only"}, status=403)

        name = request.data.get("name", "").strip()
        slug = request.data.get("slug", "").strip()
        description = request.data.get("description", "").strip()
        scopes = request.data.get("scopes", [])
        allowed_cidrs = request.data.get("allowed_cidrs", [])

        if not name or not slug:
            return Response({"error": "name và slug bắt buộc"}, status=400)

        if M2MServiceAccount.objects.filter(slug=slug).exists():
            return Response({"error": f"Slug '{slug}' đã tồn tại"}, status=400)

        raw_token = M2MServiceAccount.generate_token()
        account = M2MServiceAccount.objects.create(
            name=name,
            slug=slug,
            description=description,
            token_hash=M2MServiceAccount.hash_token(raw_token),
            token_prefix=raw_token[:16],
            scopes=scopes,
            allowed_cidrs=allowed_cidrs,
        )

        return Response({
            "id": account.id,
            "name": account.name,
            "slug": account.slug,
            "token": raw_token,
            "token_prefix": account.token_prefix,
            "scopes": account.scopes,
            "message": "Token chỉ hiện 1 lần. Lưu ngay vào .env của hệ thống gọi.",
        }, status=201)


class ServiceAccountDetailView(APIView):
    """PATCH: Update account (scopes, cidrs, status). DELETE: Remove."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not _is_admin(request.user):
            return Response({"error": "Admin only"}, status=403)
        try:
            account = M2MServiceAccount.objects.get(pk=pk)
        except M2MServiceAccount.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if "scopes" in request.data:
            account.scopes = request.data["scopes"]
        if "allowed_cidrs" in request.data:
            account.allowed_cidrs = request.data["allowed_cidrs"]
        if "status" in request.data and request.data["status"] in ("active", "revoked"):
            account.status = request.data["status"]
        if "description" in request.data:
            account.description = request.data["description"]

        account.save()
        return Response({"status": "updated"})

    def delete(self, request, pk):
        if not _is_admin(request.user):
            return Response({"error": "Admin only"}, status=403)
        M2MServiceAccount.objects.filter(pk=pk).delete()
        return Response({"status": "deleted"})


class ServiceAccountRotateView(APIView):
    """POST: Rotate token — returns new token once, old token invalidated."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _is_admin(request.user):
            return Response({"error": "Admin only"}, status=403)
        try:
            account = M2MServiceAccount.objects.get(pk=pk)
        except M2MServiceAccount.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        raw_token = M2MServiceAccount.generate_token()
        account.token_hash = M2MServiceAccount.hash_token(raw_token)
        account.token_prefix = raw_token[:16]
        account.last_rotated_at = timezone.now()
        account.save(update_fields=["token_hash", "token_prefix", "last_rotated_at"])

        return Response({
            "token": raw_token,
            "token_prefix": account.token_prefix,
            "message": "Token mới chỉ hiện 1 lần. Token cũ đã vô hiệu.",
        })


# ─── Integration Config (outbound tokens) ────────────────────────────

class IntegrationListView(APIView):
    """GET: List all integration configs. PATCH by system slug."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"error": "Admin only"}, status=403)
        configs = IntegrationConfig.objects.all()
        return Response({"results": [{
            "id": c.id,
            "system": c.system,
            "label": c.label or c.get_system_display(),
            "token": c.token[:20] + "..." if len(c.token) > 20 else c.token,
            "token_set": bool(c.token),
            "scopes": c.scopes,
            "base_url": c.base_url,
            "enabled": c.enabled,
            "notes": c.notes,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        } for c in configs]})


class IntegrationInternalView(APIView):
    """GET: Full config including untruncated token — for BFF internal use."""
    permission_classes = [IsAuthenticated]

    def get(self, request, system):
        try:
            config = IntegrationConfig.objects.get(system=system)
        except IntegrationConfig.DoesNotExist:
            return Response({"error": "Not found"}, status=404)
        if not config.enabled:
            return Response({"error": "Integration disabled"}, status=400)
        return Response({
            "system": config.system,
            "token": config.token,
            "scopes": config.scopes,
            "base_url": config.base_url,
            "enabled": config.enabled,
        })


class IntegrationDetailView(APIView):
    """PATCH: Update integration config (token, scopes, base_url, enabled, notes)."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, system):
        if not _is_admin(request.user):
            return Response({"error": "Admin only"}, status=403)
        try:
            config = IntegrationConfig.objects.get(system=system)
        except IntegrationConfig.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        if "token" in request.data:
            config.token = request.data["token"]
        if "scopes" in request.data:
            config.scopes = request.data["scopes"]
        if "base_url" in request.data:
            config.base_url = request.data["base_url"]
        if "enabled" in request.data:
            config.enabled = request.data["enabled"]
        if "notes" in request.data:
            config.notes = request.data["notes"]
        config.save()
        return Response({"status": "updated"})
