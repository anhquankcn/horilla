"""API endpoints for creating/managing employee Keycloak SSO accounts."""
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from rest_framework.response import Response
from rest_framework.views import APIView

from employee.models import Employee
from horilla_api import keycloak_service as kc


DEFAULT_PASSWORD = "Hnh@1234"


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
                                 "roles": [], "groups": []})
            uid = user["id"]
            return Response({
                "exists": True,
                "kc_id": uid,
                "username": user.get("username"),
                "enabled": user.get("enabled", True),
                "roles": kc.get_user_roles(uid),
                "groups": kc.get_user_groups(uid),
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


# ── Email ─────────────────────────────────────────────────────────────

def _send_welcome_email(emp, email: str, first: str, last: str) -> None:
    pwa_url = getattr(settings, "HNH_PWA_URL", "https://qlns.hnhtravel.work/pwa")
    coo_email = getattr(settings, "HNH_COO_EMAIL", "coo@hongngocha.com")
    full_name = f"{first} {last}".strip() or email

    # Use Horilla's DB-driven email config (DynamicEmailConfiguration)
    connection = get_connection("base.backends.ConfiguredEmailBackend")
    from_email = getattr(connection, "dynamic_from_email_with_display_name", None) or getattr(
        settings, "DEFAULT_FROM_EMAIL", "HNH Travel <noreply@hongngocha.com>"
    )

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
