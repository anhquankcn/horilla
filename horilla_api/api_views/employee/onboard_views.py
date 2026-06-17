"""Onboarding nhân sự mới (C&B): tạo Employee + WorkInfo + gán Nhóm quyền + tài khoản Keycloak.

GET  /api/employee/onboard/options/  → các list để dựng form (cty, phòng ban, vị trí, vai trò, nhóm, ca)
POST /api/employee/onboard/          → tạo NV trọn gói (atomic) + KC
"""
import logging

from django.contrib.auth.models import Group
from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


def _can_onboard(user):
    if user.is_superuser or user.has_perm("employee.add_employee"):
        return True
    gnames = [g.name.lower() for g in user.groups.all()]
    return any("c&b" in g or "c & b" in g or "chuyên viên c" in g or "admin hệ thống" in g for g in gnames)


class OnboardOptionsView(APIView):
    """Danh sách để dựng form onboarding."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _can_onboard(request.user):
            return Response({"error": "Không có quyền"}, status=403)
        from base.models import Company, Department, JobPosition, JobRole, WorkType, EmployeeShift

        def lst(qs, label):
            return [{"id": o.id, "name": getattr(o, label)} for o in qs]

        ald26 = EmployeeShift.objects.filter(employee_shift="ALD26").first()
        return Response({
            "companies": lst(Company.objects.all(), "company"),
            "departments": lst(Department.objects.all(), "department"),
            "job_positions": [
                {"id": o.id, "name": o.job_position, "department_id": o.department_id_id}
                for o in JobPosition.objects.all()
            ],
            "job_roles": [
                {"id": o.id, "name": o.job_role, "job_position_id": o.job_position_id_id}
                for o in JobRole.objects.all()
            ],
            "work_types": lst(WorkType.objects.all(), "work_type"),
            "shifts": lst(EmployeeShift.objects.all(), "employee_shift"),
            "groups": [{"id": g.id, "name": g.name} for g in Group.objects.all().order_by("name")],
            "default_shift_id": ald26.id if ald26 else None,
        })


class OnboardEmployeeView(APIView):
    """Tạo nhân sự mới trọn gói: Employee → WorkInformation → Nhóm quyền → Keycloak."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from employee.models import Employee, EmployeeWorkInformation
        from base.models import (
            Company, Department, JobPosition, JobRole, WorkType, EmployeeShift,
        )

        if not _can_onboard(request.user):
            return Response({"error": "Không có quyền onboarding nhân sự"}, status=403)

        d = request.data
        first_name = (d.get("first_name") or "").strip()
        last_name = (d.get("last_name") or "").strip()
        email = (d.get("email") or "").strip().lower()
        badge_id = (d.get("badge_id") or "").strip()
        phone = (d.get("phone") or "").strip()

        if not first_name:
            return Response({"error": "Thiếu Tên"}, status=400)
        if not email:
            return Response({"error": "Thiếu Email (bắt buộc để tạo tài khoản Keycloak)"}, status=400)
        if not badge_id:
            return Response({"error": "Thiếu Mã nhân viên (badge_id)"}, status=400)
        if Employee.objects.filter(email=email).exists():
            return Response({"error": f"Email {email} đã tồn tại"}, status=400)
        if Employee.objects.filter(badge_id=badge_id).exists():
            return Response({"error": f"Mã NV {badge_id} đã tồn tại"}, status=400)

        def _fk(model, key):
            v = d.get(key)
            return model.objects.filter(id=v).first() if v else None

        try:
            with transaction.atomic():
                emp = Employee(
                    employee_first_name=first_name,
                    employee_last_name=last_name,
                    email=email,
                    phone=phone or None,
                    badge_id=badge_id,
                    gender=d.get("gender") or "male",
                    is_active=True,
                )
                emp.save()  # tự tạo User (username=email, password=phone)
                emp.refresh_from_db()

                wi = getattr(emp, "employee_work_info", None) or EmployeeWorkInformation(employee_id=emp)
                wi.company_id = _fk(Company, "company_id")
                wi.department_id = _fk(Department, "department_id")
                wi.job_position_id = _fk(JobPosition, "job_position_id")
                wi.job_role_id = _fk(JobRole, "job_role_id")
                wi.work_type_id = _fk(WorkType, "work_type_id")
                # Ca mặc định ALD26 nếu không truyền
                shift = _fk(EmployeeShift, "shift_id") or EmployeeShift.objects.filter(employee_shift="ALD26").first()
                wi.shift_id = shift
                if d.get("date_joining"):
                    wi.date_joining = d.get("date_joining")
                if email:
                    wi.email = email
                wi.save()

                # Nhóm quyền
                group_ids = d.get("group_ids") or []
                user = emp.employee_user_id
                if group_ids and user:
                    user.groups.add(*Group.objects.filter(id__in=group_ids))
        except Exception as e:
            logger.exception("onboard create failed")
            return Response({"error": f"Lỗi tạo nhân sự: {e}"}, status=400)

        # Keycloak (ngoài transaction — gọi hệ thống ngoài)
        kc = {"ok": False, "skipped": True}
        if d.get("create_kc", True):
            try:
                from horilla.keycloak_admin import sync_employee_to_kc
                kc = sync_employee_to_kc(emp)
            except Exception as e:
                logger.exception("onboard KC sync failed")
                kc = {"ok": False, "error": str(e)}

        return Response({
            "ok": True,
            "employee_id": emp.id,
            "badge_id": emp.badge_id,
            "name": emp.get_full_name(),
            "keycloak": kc,
        }, status=201)
