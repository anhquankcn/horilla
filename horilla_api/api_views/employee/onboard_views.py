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


def _parse_date(v):
    """Nhận 'YYYY-MM-DD' (input date) hoặc 'DD/MM/YYYY'. Trả date hoặc None."""
    if not v:
        return None
    v = str(v).strip()
    from datetime import datetime as _dt
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return _dt.strptime(v, fmt).date()
        except ValueError:
            continue
    return None


def _can_onboard(user):
    if user.is_superuser or user.has_perm("employee.add_employee"):
        return True
    gnames = [g.name.lower() for g in user.groups.all()]
    return any("c&b" in g or "c & b" in g or "chuyên viên c" in g or "admin hệ thống" in g for g in gnames)


class ReactivateEmployeeView(APIView):
    """POST /api/employee/employees/<pk>/reactivate/ — C&B "Làm việc lại": kích hoạt
    lại NV đang Tạm nghỉ. Bật ĐỦ 3 lớp để NV đăng nhập + chấm công lại bình thường:
    Employee.is_active + auth User.is_active + Keycloak enabled (khắc phục việc
    EmployeeArchiveView chỉ đổi cờ Django, không mở lại tài khoản KC)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _can_onboard(request.user):
            return Response({"detail": "Chỉ C&B mới có thể kích hoạt lại nhân viên."}, status=403)

        from employee.models import Employee

        emp = Employee.objects.filter(pk=pk).first()
        if emp is None:
            return Response({"detail": "Không tìm thấy nhân viên."}, status=404)
        if emp.is_active:
            return Response({"detail": "Nhân viên đang hoạt động.", "is_active": True}, status=400)

        # 1) HRM: bật cờ Employee + tài khoản auth (đăng nhập Django/JWT)
        emp.is_active = True
        emp.save(update_fields=["is_active"])
        # Gỡ ngày tạm dừng (NV làm việc lại → không còn nằm trong danh sách nghỉ).
        if isinstance(emp.additional_info, dict) and isinstance(emp.additional_info.get("hr_master"), dict):
            if emp.additional_info["hr_master"].get("deactivated_date"):
                emp.additional_info["hr_master"]["deactivated_date"] = ""
                Employee.objects.filter(pk=emp.pk).update(additional_info=emp.additional_info)
        user = emp.employee_user_id
        if user and not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])

        # 2) Keycloak: enable lại (best-effort — không chặn nếu KC lỗi)
        kc_enabled = False
        kc_error = None
        try:
            from horilla.keycloak_admin import sync_employee_to_kc
            res = sync_employee_to_kc(emp) or {}
            kc_enabled = bool(res.get("ok"))
            if not kc_enabled:
                kc_error = res.get("error")
        except Exception as e:  # noqa: BLE001
            kc_error = str(e)

        logger.info(
            "REACTIVATE by=%s emp=%s(%s) user_active=%s kc_enabled=%s err=%s",
            getattr(request.user, "username", "?"), emp.id, emp.badge_id,
            bool(user and user.is_active), kc_enabled, kc_error,
        )

        return Response({
            "ok": True,
            "id": emp.id,
            "is_active": True,
            "kc_enabled": kc_enabled,
            "kc_error": kc_error,
        })


class SuspendEmployeeView(APIView):
    """POST /api/employee/employees/<pk>/suspend/ — C&B "Tạm nghỉ": ngưng hoạt động NV.
    Đối xứng với ReactivateEmployeeView — tắt ĐỦ 3 lớp: Employee.is_active +
    auth User.is_active + Keycloak disabled.

    CHẶN nếu NV còn là quản lý trực tiếp của người ĐANG hoạt động (tránh treo cấp
    dưới không có quản lý) — trả 400 kèm danh sách để C&B chuyển quản lý trước.
    Cấp dưới đã nghỉ (inactive) được BỎ QUA và gỡ FK quản lý cũ cho sạch dữ liệu
    (đây là lý do NV có cấp dưới đã nghỉ trước đây không Tạm nghỉ được)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not _can_onboard(request.user):
            return Response(
                {"detail": "Chỉ C&B mới có thể chuyển nhân viên sang Tạm nghỉ."},
                status=403,
            )

        from employee.models import Employee, EmployeeWorkInformation

        emp = Employee.objects.filter(pk=pk).first()
        if emp is None:
            return Response({"detail": "Không tìm thấy nhân viên."}, status=404)
        if not emp.is_active:
            return Response(
                {"detail": "Nhân viên đã ở trạng thái Tạm nghỉ.", "is_active": False},
                status=400,
            )

        # Chặn nếu còn cấp dưới ĐANG hoạt động báo cáo trực tiếp cho NV này.
        active_reports = EmployeeWorkInformation.objects.filter(
            reporting_manager_id=emp.pk, employee_id__is_active=True
        ).select_related("employee_id")
        if active_reports.exists():
            reports = [
                {
                    "id": wi.employee_id_id,
                    "badge": wi.employee_id.badge_id,
                    "name": (
                        (wi.employee_id.employee_last_name or "")
                        + " "
                        + (wi.employee_id.employee_first_name or "")
                    ).strip(),
                }
                for wi in active_reports
            ]
            return Response(
                {
                    "detail": (
                        "Nhân viên đang là quản lý trực tiếp của %d người đang làm việc. "
                        "Vui lòng chuyển các nhân viên này sang quản lý khác trước khi "
                        "cho Tạm nghỉ." % len(reports)
                    ),
                    "blocking_reports": reports,
                },
                status=400,
            )

        # Cấp dưới đã nghỉ vẫn trỏ FK quản lý về NV này → gỡ cho sạch (không chặn).
        cleared = EmployeeWorkInformation.objects.filter(
            reporting_manager_id=emp.pk, employee_id__is_active=False
        ).update(reporting_manager_id=None)

        # 1) HRM: tắt cờ Employee. DÙNG queryset .update() để KHÔNG gọi
        # Employee.save() — save() có guard (models.py) tự ÉP is_active=True khi
        # get_archive_condition() != False trong ngữ cảnh request. Đây chính là
        # lý do PUT is_active=false trước đây trả 200 nhưng NV vẫn active. Ta đã
        # tự guard đúng policy ở trên (chỉ chặn cấp dưới ĐANG hoạt động).
        Employee.objects.filter(pk=emp.pk).update(is_active=False)
        # Ghi ngày tạm dừng vào additional_info['hr_master'] (dùng cho export NV
        # nghỉ/tháng ở Data Nhân sự). Dùng .update() để không kích guard save().
        from datetime import date as _date
        ai = emp.additional_info if isinstance(emp.additional_info, dict) else {}
        hm = ai.get("hr_master") if isinstance(ai.get("hr_master"), dict) else {}
        hm["deactivated_date"] = _date.today().isoformat()
        ai["hr_master"] = hm
        Employee.objects.filter(pk=emp.pk).update(additional_info=ai)
        emp.refresh_from_db()
        # Tài khoản auth (chặn đăng nhập Django/JWT) — User.save() không có guard.
        user = emp.employee_user_id
        if user and user.is_active:
            user.is_active = False
            user.save(update_fields=["is_active"])

        # 2) Keycloak: disable (best-effort — không chặn nếu KC lỗi)
        kc_disabled = False
        kc_error = None
        try:
            from horilla.keycloak_admin import sync_employee_to_kc

            res = sync_employee_to_kc(emp) or {}
            kc_disabled = bool(res.get("ok"))
            if not kc_disabled:
                kc_error = res.get("error")
        except Exception as e:  # noqa: BLE001
            kc_error = str(e)

        logger.info(
            "SUSPEND by=%s emp=%s(%s) user_active=%s kc_disabled=%s cleared_stale=%s err=%s",
            getattr(request.user, "username", "?"), emp.id, emp.badge_id,
            bool(user and user.is_active), kc_disabled, cleared, kc_error,
        )

        return Response({
            "ok": True,
            "id": emp.id,
            "is_active": False,
            "kc_disabled": kc_disabled,
            "kc_error": kc_error,
            "cleared_stale_reports": cleared,
        })


def _suggest_next_hnh_code():
    """Gợi ý Mã NV kế tiếp dạng HNH00XXX (HNH + 5 số zero-pad, khớp mã hiện có):
    số = MAX đã cấp + 1 (loại sentinel admin HNH00999), đảm bảo KHÔNG trùng
    badge_id/employee_code đang có."""
    import re
    from employee.models import Employee
    nums = set()
    used = set()
    for badge, code in Employee.objects.values_list("badge_id", "employee_code"):
        for v in (badge, code):
            if not v:
                continue
            v = v.strip()
            used.add(v)
            m = re.match(r"^HNH0*([0-9]+)$", v, re.IGNORECASE)
            if m:
                n = int(m.group(1))
                if n < 900:  # bỏ sentinel admin (HNH00999) khỏi tính max
                    nums.add(n)
    nxt = (max(nums) + 1) if nums else 1
    while f"HNH{nxt:05d}" in used:
        nxt += 1
    return f"HNH{nxt:05d}"


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
            "suggested_badge_id": _suggest_next_hnh_code(),
            "marital_statuses": [
                {"id": "single", "name": "Độc thân"},
                {"id": "married", "name": "Đã kết hôn"},
                {"id": "divorced", "name": "Đã ly hôn"},
            ],
            "education_levels": [
                {"id": "Trung học phổ thông", "name": "Trung học phổ thông"},
                {"id": "Trung cấp", "name": "Trung cấp"},
                {"id": "Cao đẳng", "name": "Cao đẳng"},
                {"id": "Đại học", "name": "Đại học"},
                {"id": "Sau đại học", "name": "Sau đại học"},
            ],
        })


class OnboardScanIdView(APIView):
    """Quét ảnh CCCD/CMND/Hộ chiếu qua Arkon AI → trả field tiền-điền form onboard.

    Backend Django gọi Arkon (token là secret server, KHÔNG để lộ ra PWA).
    Spec: docs/HRM-ID-SCAN-INTEGRATION.md (repo arkon).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        import os
        import requests as http_requests

        if not _can_onboard(request.user):
            return Response({"error": "Không có quyền"}, status=403)

        image_b64 = request.data.get("image_base64")
        if not image_b64:
            return Response({"error": "Thiếu ảnh (image_base64)"}, status=400)

        token = os.environ.get("ARKAN_IDSCAN_TOKEN")
        if not token:
            return Response(
                {"error": "Chưa cấu hình ARKAN_IDSCAN_TOKEN trên server"}, status=503
            )
        base = os.environ.get("ARKAN_BASE", "http://100.99.164.24:5166").rstrip("/")

        try:
            r = http_requests.post(
                f"{base}/api/m2m/id-scan/json",
                headers={"X-Arkan-Service-Token": token, "Content-Type": "application/json"},
                json={
                    "image_base64": image_b64,
                    "mime_type": request.data.get("mime_type") or "image/jpeg",
                },
                timeout=35,
            )
        except http_requests.RequestException as e:
            logger.warning("Arkan id-scan unreachable: %s", e)
            return Response({"error": "Không kết nối được dịch vụ nhận diện"}, status=502)

        if r.status_code == 413:
            return Response({"error": "Ảnh quá lớn (>8MB), vui lòng nén lại"}, status=400)
        if r.status_code in (401, 403):
            logger.error("Arkan id-scan auth failed: %s", r.status_code)
            return Response({"error": "Lỗi xác thực dịch vụ nhận diện"}, status=502)
        if r.status_code != 200:
            return Response({"error": f"Nhận diện lỗi ({r.status_code})"}, status=502)

        data = r.json()
        # Lỗi tầng vision trả 200 kèm "error" → cho người dùng thử lại
        if data.get("error"):
            return Response({"error": data["error"]}, status=502)

        sex = (data.get("sex") or "").lower()
        gender = "female" if ("nữ" in sex or "nu" in sex) else "male" if ("nam" in sex) else ""

        return Response({
            "full_name": data.get("full_name") or "",
            "dob": data.get("date_of_birth") or "",
            "gender": gender,
            "cccd": data.get("id_number") or data.get("passport_no") or "",
            "cccd_issue_date": data.get("issue_date") or "",
            "cccd_issue_place": data.get("issuing_authority") or "",
            "address": data.get("place_of_residence") or "",
            "place_of_origin": data.get("place_of_origin") or "",
            "document_type": data.get("document_type") or "",
            "confidence": data.get("confidence") or "",
            "warnings": data.get("warnings") or [],
        }, status=200)


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
        existing = Employee.objects.filter(email=email).first()
        if existing:
            if not existing.is_active:
                return Response({
                    "error": (
                        f"Email {email} thuộc nhân viên {existing.get_full_name()} "
                        f"({existing.badge_id}) đang bị vô hiệu hóa. "
                        "Vào Django Admin → Employees → kích hoạt lại thay vì tạo mới."
                    )
                }, status=400)
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
                    employee_code=badge_id,  # NV mới: Mã HRM = Badge ID (đồng bộ từ đầu)
                    gender=d.get("gender") or "male",
                    is_active=True,
                )
                # Trường cá nhân chuẩn (Employee)
                dob = _parse_date(d.get("dob"))
                if dob:
                    emp.dob = dob
                if d.get("marital_status"):
                    emp.marital_status = d.get("marital_status")
                if d.get("qualification"):
                    emp.qualification = d.get("qualification")
                if d.get("address"):  # địa chỉ thường trú (theo CCCD)
                    emp.address = d.get("address")
                    emp.country = emp.country or "Vietnam"
                emp.save()  # tự tạo User (username=email, password=phone)
                emp.refresh_from_db()

                # Thử việc (độc lập hợp đồng): bật cờ + số ngày chọn khi onboarding
                # (mặc định 60). HR tắt cờ khi ký chính thức.
                try:
                    prob_days = int(d.get("probation_days") or 60)
                except (TypeError, ValueError):
                    prob_days = 60
                prob_flag = d.get("probation_flag", True)
                prob_flag = prob_flag in (True, "true", "1", 1) if prob_flag is not None else True
                ai = emp.additional_info if isinstance(emp.additional_info, dict) else {}
                hm = ai.get("hr_master") if isinstance(ai.get("hr_master"), dict) else {}
                hm["probation_flag"] = bool(prob_flag)
                hm["probation_days"] = prob_days
                ai["hr_master"] = hm
                emp.additional_info = ai
                emp.save(update_fields=["additional_info"])

                wi = getattr(emp, "employee_work_info", None) or EmployeeWorkInformation(employee_id=emp)
                wi.company_id = _fk(Company, "company_id")
                wi.department_id = _fk(Department, "department_id")
                wi.job_position_id = _fk(JobPosition, "job_position_id")
                wi.job_role_id = _fk(JobRole, "job_role_id")
                wi.work_type_id = _fk(WorkType, "work_type_id")
                # Ca mặc định ALD26 nếu không truyền
                shift = _fk(EmployeeShift, "shift_id") or EmployeeShift.objects.filter(employee_shift="ALD26").first()
                wi.shift_id = shift
                dj = _parse_date(d.get("date_joining"))
                if dj:
                    wi.date_joining = dj
                if email:
                    wi.email = email
                if phone:
                    wi.mobile = phone
                wi.save()

                # Ngân hàng (mặc định VCB)
                acc = (d.get("bank_account") or "").strip()
                bank_name = (d.get("bank_name") or "").strip()
                bank_branch = (d.get("bank_branch") or "").strip()
                if acc or bank_name or bank_branch:
                    from employee.models import EmployeeBankDetails
                    bd = getattr(emp, "employee_bank_details", None) or EmployeeBankDetails(employee_id=emp)
                    bd.account_number = acc or bd.account_number
                    bd.bank_name = bank_name or "Vietcombank (VCB)"
                    bd.branch = bank_branch or bd.branch
                    bd.save()

                # Hồ sơ HNH mở rộng (CCCD, BHXH, chủ hộ, MST...)
                from employee.models import HNHEmployeeProfile
                prof = HNHEmployeeProfile(employee_id=emp)
                prof.cccd = (d.get("cccd") or "").strip() or None
                prof.cccd_issue_date = _parse_date(d.get("cccd_issue_date"))
                prof.cccd_issue_place = (d.get("cccd_issue_place") or "").strip() or None
                prof.job_title = (d.get("job_title") or "").strip() or None
                prof.major = (d.get("major") or "").strip() or None
                prof.temporary_address = (d.get("temporary_address") or "").strip() or None
                prof.ethnicity = (d.get("ethnicity") or "").strip() or "Kinh"
                prof.birth_cert_place = (d.get("birth_cert_place") or "").strip() or None
                prof.license_plate = (d.get("license_plate") or "").strip() or None
                prof.bhxh_number = (d.get("bhxh_number") or "").strip() or None
                prof.bhxh_hospital = (d.get("bhxh_hospital") or "").strip() or None
                prof.tax_code = (d.get("tax_code") or "").strip() or None
                prof.unemployment_benefit = bool(d.get("unemployment_benefit"))
                prof.household_head_name = (d.get("household_head_name") or "").strip() or None
                prof.household_head_dob = _parse_date(d.get("household_head_dob"))
                prof.household_head_cccd = (d.get("household_head_cccd") or "").strip() or None
                prof.household_head_phone = (d.get("household_head_phone") or "").strip() or None
                prof.household_address = (d.get("household_address") or "").strip() or None
                prof.household_relation = (d.get("household_relation") or "").strip() or None
                prof.save()

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
