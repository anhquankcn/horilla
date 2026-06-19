"""KC password management views — change password, send reset email."""
import secrets
import string

from rest_framework.response import Response
from rest_framework.views import APIView

from horilla_api import keycloak_service as kc


class ChangePasswordView(APIView):
    """POST /api/base/change-password/
    Body: { old_password, new_password }
    Verifies old password via KC token endpoint then sets new password.
    """

    def post(self, request):
        old_pw = request.data.get("old_password", "").strip()
        new_pw = request.data.get("new_password", "").strip()

        if not old_pw or not new_pw:
            return Response({"error": "Vui lòng nhập đầy đủ mật khẩu cũ và mới"}, status=400)
        if len(new_pw) < 8:
            return Response({"error": "Mật khẩu mới phải có ít nhất 8 ký tự"}, status=400)

        email = request.user.email
        if not email:
            return Response({"error": "Tài khoản chưa có email"}, status=400)

        kc_user = kc.get_user_by_email(email)
        if not kc_user:
            return Response({"error": "Không tìm thấy tài khoản Keycloak"}, status=404)

        try:
            valid = kc.verify_password(email, old_pw)
        except Exception:
            return Response({"error": "Không thể xác thực với Keycloak, thử lại sau"}, status=503)

        if not valid:
            return Response({"error": "Mật khẩu cũ không đúng"}, status=400)

        try:
            kc.reset_password(kc_user["id"], new_pw)
        except Exception as exc:
            return Response({"error": f"Không thể đổi mật khẩu: {exc}"}, status=500)

        return Response({"success": True, "message": "Đổi mật khẩu thành công"})


class SendPasswordResetEmailView(APIView):
    """POST /api/base/send-password-reset-email/
    Generates a temporary password, sets it as temporary in KC (forces reset on
    next login), then emails it via Django SMTP.  Works regardless of whether the
    user already has a KC account.
    """

    def post(self, request):
        from django.core.mail import send_mail
        from employee.models import Employee

        email = request.user.email
        if not email:
            return Response({"error": "Tài khoản chưa có email"}, status=400)

        emp = Employee.objects.filter(employee_user_id=request.user).first()
        first = emp.employee_first_name if emp else ""
        last = emp.employee_last_name if emp else ""

        chars = string.ascii_letters + string.digits + "!@#$%"
        temp_pw = "".join(secrets.choice(chars) for _ in range(12))

        kc_user = kc.get_user_by_email(email)
        if kc_user:
            uid = kc_user["id"]
        else:
            try:
                uid = kc.create_user(email, first, last, temp_pw)
                if not uid:
                    return Response({"error": "Không thể tạo tài khoản KC"}, status=500)
            except Exception as exc:
                return Response({"error": f"Không thể tạo tài khoản KC: {exc}"}, status=500)

        try:
            kc.reset_password(uid, temp_pw, temporary=True)
        except Exception as exc:
            return Response({"error": f"Không thể đặt mật khẩu tạm: {exc}"}, status=500)

        try:
            send_mail(
                subject="[HNH HRM] Mật khẩu tạm thời của bạn",
                message=(
                    f"Xin chào {first} {last},\n\n"
                    f"Hệ thống HNH HRM đã tạo mật khẩu tạm thời cho tài khoản của bạn:\n\n"
                    f"  Tài khoản: {email}\n"
                    f"  Mật khẩu:  {temp_pw}\n\n"
                    f"Vui lòng đăng nhập và đổi mật khẩu ngay sau khi nhận được email này.\n\n"
                    f"Hồng Ngọc Hà Travel HRM"
                ),
                from_email=None,
                recipient_list=[email],
                fail_silently=False,
            )
        except Exception as exc:
            return Response({"error": f"Đặt mật khẩu OK nhưng không gửi được email: {exc}"}, status=500)

        return Response({
            "success": True,
            "message": f"Đã gửi mật khẩu tạm thời tới {email}",
        })
