"""API endpoints for creating/managing employee Keycloak SSO accounts."""
import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import EmailMultiAlternatives
from django.core.mail.backends.smtp import EmailBackend as SmtpBackend
from django.db import transaction
from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from base.models import DynamicEmailConfiguration
from employee.models import Employee
from horilla_api import keycloak_service as kc


logger = logging.getLogger(__name__)

DEFAULT_PASSWORD = "Hnh@1234"


def _norm(s) -> str:
    return (s or "").strip()


# ── Options ──────────────────────────────────────────────────────────

class KcOptionsView(APIView):
    """GET /api/employee/kc-options/ — list KC roles & groups for picker."""

    def get(self, request):
        try:
            roles = kc.list_roles()
            groups = kc.list_groups()
            return Response({"roles": roles, "groups": groups})
        except Exception as e:
            return Response({"error": str(e)}, status=502)


# ── Per-employee account ──────────────────────────────────────────────

class KcAccountView(APIView):
    """
    GET  /api/employee/<pk>/kc-account/  — check existing KC account
    POST /api/employee/<pk>/kc-account/  — create account + send welcome email
    """

    def _get_employee(self, pk, request):
        try:
            emp = Employee.objects.select_related(
                "employee_work_info__department_id",
            ).get(pk=pk)
        except Employee.DoesNotExist:
            return None, Response({"error": "Employee not found"}, status=404)

        # Only HR/admin (can_edit_work_info flag equivalents) can manage accounts.
        user = request.user
        is_hr = user.has_perm("employee.view_employee")
        is_mgr = (
            hasattr(user, "employee_get")
            and user.employee_get.id == emp.id
        )
        if not (is_hr or user.is_superuser):
            return None, Response({"error": "Không có quyền"}, status=403)

        return emp, None

    def get(self, request, pk):
        emp, err = self._get_employee(pk, request)
        if err:
            return err

        email = emp.email
        if not email:
            return Response({"exists": False, "kc_id": None, "username": None,
                             "roles": [], "groups": []})
        try:
            user = kc.get_user_by_email(email)
            if not user:
                return Response({"exists": False, "kc_id": None, "username": None,
                                 "roles": [], "groups": [],
                                 "last_password_reset_sent_at": None,
                                 "last_password_reset_sent_by_name": None})
            uid = user["id"]
            from employee.models import HNHEmployeeProfile
            prof = getattr(emp, "hnh_profile", None)
            reset_at = prof.last_password_reset_sent_at.isoformat() if prof and prof.last_password_reset_sent_at else None
            reset_by = None
            if prof and prof.last_password_reset_sent_by_id:
                u = prof.last_password_reset_sent_by
                reset_by = getattr(u, "get_full_name", lambda: u.username)() or u.username
            return Response({
                "exists": True,
                "kc_id": uid,
                "username": user.get("username"),
                "enabled": user.get("enabled", True),
                "roles": kc.get_user_roles(uid),
                "groups": kc.get_user_groups(uid),
                "required_actions": user.get("requiredActions", []),
                "last_password_reset_sent_at": reset_at,
                "last_password_reset_sent_by_name": reset_by,
            })
        except Exception as e:
            return Response({"error": str(e)}, status=502)

    def post(self, request, pk):
        emp, err = self._get_employee(pk, request)
        if err:
            return err

        email = emp.email
        if not email:
            return Response({"error": "Nhân viên chưa có email"}, status=400)

        role_ids: list = request.data.get("roles", [])
        group_ids: list = request.data.get("groups", [])

        try:
            first = emp.employee_first_name or ""
            last = emp.employee_last_name or ""
            uid = kc.create_user(email, first, last, DEFAULT_PASSWORD)
            if not uid:
                return Response({"error": "Không thể tạo tài khoản KC"}, status=502)

            if role_ids:
                kc.assign_roles(uid, role_ids)
            if group_ids:
                kc.assign_groups(uid, group_ids)

            _send_welcome_email(emp, email, first, last)

            return Response({
                "success": True,
                "kc_id": uid,
                "message": f"Tài khoản đã tạo và gửi email tới {email}",
            }, status=201)

        except Exception as e:
            return Response({"error": str(e)}, status=502)

    def patch(self, request, pk):
        emp, err = self._get_employee(pk, request)
        if err:
            return err

        email = emp.email
        if not email:
            return Response({"error": "Nhân viên chưa có email"}, status=400)

        try:
            user = kc.get_user_by_email(email)
        except Exception as e:
            return Response({"error": str(e)}, status=502)

        if not user:
            return Response({"error": "Chưa có tài khoản SSO"}, status=404)

        uid = user["id"]
        action = request.data.get("action")
        first = emp.employee_first_name or ""
        last = emp.employee_last_name or ""

        try:
            if action == "resend_welcome":
                _send_welcome_email(emp, email, first, last)
                return Response({"success": True, "message": f"Đã gửi email chào mừng tới {email}"})

            elif action == "reset_password":
                kc.reset_password(uid, DEFAULT_PASSWORD)
                _send_welcome_email(emp, email, first, last)
                from django.utils import timezone
                from employee.models import HNHEmployeeProfile
                prof, _ = HNHEmployeeProfile.objects.get_or_create(employee_id=emp)
                prof.last_password_reset_sent_at = timezone.now()
                prof.last_password_reset_sent_by = request.user
                prof.save(update_fields=["last_password_reset_sent_at", "last_password_reset_sent_by"])
                return Response({
                    "success": True,
                    "message": f"Đã reset mật khẩu về {DEFAULT_PASSWORD} và gửi email tới {email}",
                })

            elif action == "set_force_change":
                enabled: bool = bool(request.data.get("enabled", True))
                current = kc.get_required_actions(uid)
                if enabled and "UPDATE_PASSWORD" not in current:
                    current.append("UPDATE_PASSWORD")
                elif not enabled and "UPDATE_PASSWORD" in current:
                    current.remove("UPDATE_PASSWORD")
                kc.set_required_actions(uid, current)
                return Response({"success": True, "required_actions": current})

            else:
                return Response({"error": "action không hợp lệ"}, status=400)

        except Exception as e:
            return Response({"error": str(e)}, status=502)


class KcIdentityView(APIView):
    """Đổi email/username đăng nhập của nhân viên — đồng bộ HRM + Keycloak.

    GET  /api/employee/<pk>/kc-account/identity/?new_email=&new_username=
         → preview kế hoạch (rename | link_existing | create | noop), cột HRM
           sẽ đổi, tình trạng KC cũ/mới, cảnh báo, xung đột. Không thay đổi gì.
    POST /api/employee/<pk>/kc-account/identity/
         body {new_email, new_username?, expected_plan?, disable_old?}
         → thực thi (KC trước, HRM sau trong transaction).

    Chỉ C&B / admin hệ thống (giống quyền onboard) được dùng.
    """

    permission_classes = [IsAuthenticated]

    def _guard(self, pk, request):
        from horilla_api.api_views.employee.onboard_views import _can_onboard

        if not _can_onboard(request.user):
            return None, Response({"error": "Không có quyền"}, status=403)
        try:
            emp = Employee.objects.select_related("employee_user_id").get(pk=pk)
        except Employee.DoesNotExist:
            return None, Response({"error": "Không tìm thấy nhân viên"}, status=404)
        return emp, None

    def _hrm_targets(self, emp, old_email, new_email, new_username):
        """Chỉ những cột HRM đang giữ ĐÚNG email đăng nhập cũ mới bị đổi.
        (vd workinfo.email có thể là email khác như 'trung.ld@' → giữ nguyên)."""
        old = old_email.lower()
        items = []
        u = emp.employee_user_id
        if u:
            if _norm(u.username).lower() == old:
                items.append(("auth_user.username", u.username, new_username))
            if _norm(u.email).lower() == old:
                items.append(("auth_user.email", u.email, new_email))
        if _norm(emp.email).lower() == old:
            items.append(("employee.email", emp.email, new_email))
        wi = getattr(emp, "employee_work_info", None)
        if wi and _norm(wi.email).lower() == old:
            items.append(("workinfo.email", wi.email, new_email))
        return items

    def _analyze(self, emp, new_email, new_username):
        old_email = _norm(emp.email)
        new_email = _norm(new_email).lower()
        new_username = _norm(new_username).lower() or new_email
        warnings, errors = [], []

        if not new_email or "@" not in new_email:
            errors.append("Email mới không hợp lệ")
        if new_email and new_email == old_email.lower():
            errors.append("Email mới trùng email hiện tại")

        # Xung đột phía HRM
        u = emp.employee_user_id
        if new_email:
            qs = User.objects.filter(Q(email__iexact=new_email) | Q(username__iexact=new_username))
            if u:
                qs = qs.exclude(pk=u.pk)
            other = qs.first()
            if other:
                errors.append(f"HRM: '{new_email}' đã thuộc tài khoản khác (user #{other.pk})")
            emp_other = Employee.objects.filter(email__iexact=new_email).exclude(pk=emp.pk).first()
            if emp_other:
                errors.append(f"HRM: '{new_email}' đã thuộc nhân viên khác (#{emp_other.pk})")

        hrm_changes = [
            {"field": f, "from": frm, "to": to}
            for (f, frm, to) in self._hrm_targets(emp, old_email, new_email, new_username)
        ]

        # Phía Keycloak
        kc_old = kc_new = None
        kc_error = None
        try:
            kc_old = kc.get_user_by_email(old_email) if old_email else None
            kc_new = kc.get_user_by_email(new_email) if new_email else None
        except Exception as e:  # KC không truy cập được
            kc_error = str(e)

        def block(u):
            return None if not u else {
                "kc_id": u["id"], "username": u.get("username"), "email": u.get("email"),
                "enabled": u.get("enabled", True), "federated": bool(u.get("federatedIdentities")),
            }

        old_block, new_block = block(kc_old), block(kc_new)

        if kc_error:
            plan = "kc_unreachable"
            warnings.append(f"Không kết nối được Keycloak: {kc_error}")
        elif kc_new and (not kc_old or kc_new["id"] != kc_old["id"]):
            plan = "link_existing"
            if new_block["federated"]:
                warnings.append("Tài khoản KC mới đã liên kết Microsoft — chỉ trỏ HRM sang, không sửa KC.")
            if kc_old:
                warnings.append(f"Tài khoản KC cũ '{old_block['username']}' sẽ bị vô hiệu hóa.")
        elif kc_old:
            plan = "rename"
            warnings.append("Đổi username KC cần bật tạm 'editUsernameAllowed' của realm rồi khôi phục.")
            if old_block["federated"]:
                warnings.append("Tài khoản KC cũ có liên kết federated — rename có thể ảnh hưởng SSO ngoài.")
        else:
            plan = "create"
            warnings.append("Chưa có tài khoản KC — sẽ tạo mới với mật khẩu mặc định.")

        return {
            "old_email": old_email, "new_email": new_email, "new_username": new_username,
            "plan": plan, "hrm_changes": hrm_changes,
            "kc_old": old_block, "kc_new": new_block, "kc_error": kc_error,
            "warnings": warnings, "errors": errors,
            "can_apply": not errors and plan != "kc_unreachable",
        }

    def get(self, request, pk):
        emp, err = self._guard(pk, request)
        if err:
            return err
        new_email = request.query_params.get("new_email", "")
        if not _norm(new_email):
            return Response({"error": "Thiếu new_email"}, status=400)
        new_username = request.query_params.get("new_username", "")
        try:
            return Response(self._analyze(emp, new_email, new_username))
        except Exception as e:
            return Response({"error": str(e)}, status=502)

    def _apply_kc(self, plan, a, emp, new_email, new_username, disable_old):
        if plan == "rename":
            kc.rename_user(a["kc_old"]["kc_id"], new_username, new_email)
            return {"action": "renamed", "kc_id": a["kc_old"]["kc_id"]}
        if plan == "link_existing":
            disabled = False
            if disable_old and a["kc_old"]:
                kc.set_enabled(a["kc_old"]["kc_id"], False)
                disabled = True
            return {"action": "linked_existing", "kc_id": a["kc_new"]["kc_id"], "disabled_old": disabled}
        if plan == "create":
            uid = kc.create_user(
                new_email, emp.employee_first_name or "", emp.employee_last_name or "", DEFAULT_PASSWORD
            )
            return {"action": "created", "kc_id": uid}
        return {"action": "noop"}

    def post(self, request, pk):
        emp, err = self._guard(pk, request)
        if err:
            return err

        new_email = _norm(request.data.get("new_email")).lower()
        new_username = _norm(request.data.get("new_username")).lower() or new_email
        expected_plan = request.data.get("expected_plan")
        disable_old = bool(request.data.get("disable_old", True))

        try:
            a = self._analyze(emp, new_email, new_username)
        except Exception as e:
            return Response({"error": str(e)}, status=502)

        if a["errors"]:
            return Response({"error": "; ".join(a["errors"]), "analysis": a}, status=400)
        if not a["can_apply"]:
            return Response({"error": "Không thể áp dụng", "analysis": a}, status=400)
        if expected_plan and expected_plan != a["plan"]:
            return Response({
                "error": f"Kế hoạch đã đổi (preview={expected_plan}, hiện tại={a['plan']}). Hãy Kiểm tra lại.",
                "analysis": a,
            }, status=409)

        old_email = a["old_email"]
        plan = a["plan"]

        # 1) Keycloak trước — nếu lỗi thì chưa đụng HRM, thoát sạch.
        try:
            kc_result = self._apply_kc(plan, a, emp, new_email, new_username, disable_old)
        except Exception as e:
            logger.exception("KC identity change — KC step failed")
            return Response({"error": f"Lỗi Keycloak: {e}. HRM chưa thay đổi."}, status=502)

        # 2) HRM (atomic). Nếu lỗi: KC đã đổi → báo rõ để xử lý tay.
        try:
            with transaction.atomic():
                u = emp.employee_user_id
                if u:
                    fields = []
                    if _norm(u.username).lower() == old_email.lower():
                        u.username = new_username; fields.append("username")
                    if _norm(u.email).lower() == old_email.lower():
                        u.email = new_email; fields.append("email")
                    if fields:
                        u.save(update_fields=fields)
                if _norm(emp.email).lower() == old_email.lower():
                    emp.email = new_email
                    emp.save(update_fields=["email"])
                wi = getattr(emp, "employee_work_info", None)
                if wi and _norm(wi.email).lower() == old_email.lower():
                    wi.email = new_email
                    wi.save(update_fields=["email"])
        except Exception as e:
            logger.exception("KC identity change — HRM step failed AFTER KC change")
            return Response({
                "error": f"KC đã đổi ({plan}) nhưng cập nhật HRM thất bại: {e}. Cần xử lý tay để đồng bộ.",
                "kc": kc_result,
            }, status=500)

        logger.warning(
            "KC identity change by user=%s emp=%s '%s' -> '%s' plan=%s",
            request.user.pk, emp.pk, old_email, new_email, plan,
        )
        return Response({
            "success": True, "plan": plan, "kc": kc_result,
            "message": f"Đã đổi {old_email} → {new_email} ({plan}).",
        })


class KcBulkCreateView(APIView):
    """POST: Bulk create KC accounts for employees in a department."""

    def post(self, request):
        user = request.user
        if not (user.is_superuser or user.has_perm("employee.view_employee")):
            return Response({"error": "Không có quyền"}, status=403)

        employees_data = request.data.get("employees", [])
        if not employees_data:
            return Response({"error": "Danh sách nhân viên rỗng"}, status=400)

        no_otp_group = None
        try:
            groups = kc.list_groups()
            no_otp_group = next((g for g in groups if g["name"] == "no-otp"), None)
        except Exception:
            pass

        results = []
        for item in employees_data:
            emp_id = item.get("id")
            role_ids = item.get("roles", [])
            try:
                emp = Employee.objects.get(pk=emp_id, is_active=True)
                email = emp.email
                if not email:
                    results.append({"id": emp_id, "status": "error", "message": "Không có email"})
                    continue

                first = emp.employee_first_name or ""
                last = emp.employee_last_name or ""
                uid = kc.create_user(email, first, last, DEFAULT_PASSWORD)
                if not uid:
                    results.append({"id": emp_id, "status": "error", "message": "KC tạo thất bại"})
                    continue

                if role_ids:
                    kc.assign_roles(uid, role_ids)
                if no_otp_group:
                    kc.assign_groups(uid, [no_otp_group["id"]])

                try:
                    _send_welcome_email(emp, email, first, last)
                except Exception:
                    pass

                results.append({"id": emp_id, "status": "ok", "email": email})
            except Employee.DoesNotExist:
                results.append({"id": emp_id, "status": "error", "message": "Không tìm thấy NV"})
            except Exception as e:
                results.append({"id": emp_id, "status": "error", "message": str(e)[:100]})

        ok_count = sum(1 for r in results if r["status"] == "ok")
        return Response({
            "total": len(results),
            "success": ok_count,
            "failed": len(results) - ok_count,
            "results": results,
        })


class KcDeptPreviewView(APIView):
    """GET: List employees in a dept that don't have KC accounts yet."""

    def get(self, request):
        user = request.user
        if not (user.is_superuser or user.has_perm("employee.view_employee")):
            return Response({"error": "Không có quyền"}, status=403)

        dept_id = request.query_params.get("department_id")
        if not dept_id:
            return Response({"error": "department_id bắt buộc"}, status=400)

        emps = Employee.objects.filter(
            is_active=True,
            employee_work_info__department_id=dept_id,
        ).select_related("employee_work_info__department_id", "employee_work_info__job_position_id")

        results = []
        for emp in emps:
            has_kc = False
            if emp.email:
                try:
                    has_kc = kc.get_user_by_email(emp.email) is not None
                except Exception:
                    pass

            wi = getattr(emp, "employee_work_info", None)
            results.append({
                "id": emp.id,
                "name": f"{emp.employee_first_name} {emp.employee_last_name or ''}".strip(),
                "email": emp.email or "",
                "badge_id": emp.badge_id or "",
                "job_position": str(wi.job_position_id) if wi and wi.job_position_id else "",
                "has_kc": has_kc,
            })

        return Response({"results": results})


# ── Email ─────────────────────────────────────────────────────────────

def _get_smtp_backend() -> tuple[SmtpBackend, str]:
    """
    Đọc cấu hình SMTP từ DynamicEmailConfiguration.
    Ưu tiên Gmail (smtp.gmail.com), sau đó is_primary=True.
    Trả về (backend, from_email).
    """
    cfg = (
        DynamicEmailConfiguration.objects.filter(host__icontains="gmail").first()
        or DynamicEmailConfiguration.objects.filter(is_primary=True).first()
        or DynamicEmailConfiguration.objects.first()
    )
    if not cfg:
        raise RuntimeError("Chưa cấu hình SMTP — vào Admin > Email Configuration để thiết lập")

    backend = SmtpBackend(
        host=cfg.host,
        port=cfg.port,
        username=cfg.username,
        password=cfg.password,
        use_tls=getattr(cfg, "use_tls", True),
        use_ssl=getattr(cfg, "use_ssl", False),
        fail_silently=False,
    )
    display = getattr(cfg, "display_name", None)
    from_email = f"{display} <{cfg.from_email}>" if display else cfg.from_email
    return backend, from_email


def _send_welcome_email(emp, email: str, first: str, last: str) -> None:
    pwa_url = getattr(settings, "HNH_PWA_URL", "https://qlns.hnhtravel.work/pwa")
    coo_email = getattr(settings, "HNH_COO_EMAIL", "coo@hongngocha.com")
    full_name = f"{first} {last}".strip() or email

    connection, from_email = _get_smtp_backend()

    subject = f"Thông báo tài khoản HNH Travel App — {full_name}"

    html = f"""<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{{font-family:'Segoe UI',Arial,sans-serif;background:#f4f5f7;margin:0;padding:0}}
  .wrap{{max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)}}
  .header{{background:linear-gradient(135deg,#c0222b 0%,#9a1a21 100%);padding:32px 28px;text-align:center}}
  .header h1{{color:#fff;margin:0;font-size:22px;letter-spacing:-.3px}}
  .header p{{color:rgba(255,255,255,.75);margin:6px 0 0;font-size:13px}}
  .body{{padding:28px}}
  .greeting{{font-size:15px;color:#1a2340;font-weight:600;margin-bottom:16px}}
  .info-box{{background:#f8f9fb;border-radius:12px;padding:18px 20px;margin:16px 0;border:1px solid #e8eaf0}}
  .info-row{{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #eef0f4}}
  .info-row:last-child{{border-bottom:none}}
  .info-label{{font-size:12px;color:#8891a8;font-weight:600}}
  .info-value{{font-size:13.5px;color:#1a2340;font-weight:700}}
  .btn{{display:block;background:#c0222b;color:#fff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-weight:700;font-size:14px;margin:20px 0}}
  .section{{margin-top:24px}}
  .section h3{{font-size:13px;font-weight:700;color:#1a2340;text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px}}
  .step{{display:flex;gap:12px;align-items:flex-start;margin-bottom:10px}}
  .step-num{{background:#1a2340;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px}}
  .step-text{{font-size:13px;color:#3a4560;line-height:1.5}}
  .warning{{background:#fff8ec;border:1px solid #f0c060;border-radius:10px;padding:12px 16px;font-size:12.5px;color:#8b6a00;margin-top:16px}}
  .footer{{background:#f8f9fb;padding:16px 28px;text-align:center;font-size:11px;color:#a0a8b8;border-top:1px solid #eef0f4}}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>HNH Travel · Tài khoản nội bộ</h1>
    <p>Thông báo tài khoản hệ thống quản lý nhân sự</p>
  </div>
  <div class="body">
    <div class="greeting">Xin chào {full_name},</div>
    <p style="font-size:13.5px;color:#3a4560;line-height:1.6;margin:0 0 16px">
      Tài khoản nội bộ của bạn trên hệ thống <strong>HNH Travel App</strong> đã được tạo thành công.
      Vui lòng đăng nhập và đổi mật khẩu ngay sau lần đăng nhập đầu tiên.
    </p>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Địa chỉ đăng nhập</span>
        <span class="info-value">{pwa_url}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Tên đăng nhập</span>
        <span class="info-value">{email}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Mật khẩu mặc định</span>
        <span class="info-value">{DEFAULT_PASSWORD}</span>
      </div>
    </div>

    <a href="{pwa_url}" class="btn">Đăng nhập ngay →</a>

    <div class="section">
      <h3>Cài đặt App trên iPhone / iPad (Safari)</h3>
      <div class="step"><div class="step-num">1</div><div class="step-text">Mở Safari và truy cập <strong>{pwa_url}</strong></div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Nhấn biểu tượng <strong>Chia sẻ</strong> (hình vuông + mũi tên lên) ở thanh dưới cùng</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">Chọn <strong>"Thêm vào Màn hình chính"</strong> → nhấn <strong>Thêm</strong></div></div>
      <div class="step"><div class="step-num">4</div><div class="step-text">App HNH Travel sẽ xuất hiện trên màn hình chính, mở như ứng dụng thật</div></div>
    </div>

    <div class="section">
      <h3>Cài đặt App trên Android (Chrome)</h3>
      <div class="step"><div class="step-num">1</div><div class="step-text">Mở Chrome và truy cập <strong>{pwa_url}</strong></div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Nhấn biểu tượng <strong>⋮ (3 chấm)</strong> ở góc trên bên phải</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">Chọn <strong>"Thêm vào màn hình chính"</strong> hoặc <strong>"Cài đặt ứng dụng"</strong></div></div>
      <div class="step"><div class="step-num">4</div><div class="step-text">Nhấn <strong>Cài đặt</strong> để xác nhận</div></div>
    </div>

    <div class="warning">
      ⚠️ <strong>Bảo mật:</strong> Vui lòng đổi mật khẩu ngay sau lần đăng nhập đầu tiên.
      Không chia sẻ mật khẩu với người khác.
    </div>
  </div>
  <div class="footer">
    © Công ty Du lịch Hồng Ngọc Hà · 185-187 Lê Thánh Tôn, P. Bến Thành, Q.1, TP.HCM<br>
    Email này được gửi tự động, vui lòng không trả lời trực tiếp.
  </div>
</div>
</body>
</html>"""

    text = (
        f"Xin chào {full_name},\n\n"
        f"Tài khoản HNH Travel App của bạn đã được tạo:\n"
        f"  Địa chỉ: {pwa_url}\n"
        f"  Tên đăng nhập: {email}\n"
        f"  Mật khẩu mặc định: {DEFAULT_PASSWORD}\n\n"
        f"Cài App trên iPhone: Mở Safari → Chia sẻ → Thêm vào Màn hình chính\n"
        f"Cài App trên Android: Mở Chrome → Menu ⋮ → Thêm vào màn hình chính\n\n"
        f"Vui lòng đổi mật khẩu sau lần đăng nhập đầu tiên.\n"
    )

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text,
        from_email=from_email,
        to=[email],
        cc=[coo_email],
        connection=connection,
    )
    msg.attach_alternative(html, "text/html")
    msg.send(fail_silently=False)
