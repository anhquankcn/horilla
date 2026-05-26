"""
OIDC auto-signup view.

When a Keycloak user authenticates successfully but has no Horilla account,
the OIDC callback stores their KC claims in the session and redirects here.
This view shows a form pre-filled with KC claims; on submit it creates:
  - Django User
  - Employee record (linked to the user)
  - Assigns the "Nhân Viên" group (created if missing)
Then logs the user in immediately.
"""
import logging

from django.contrib import messages
from django.contrib.auth import get_user_model, login
from django.contrib.auth.models import Group
from django.db import transaction
from django.shortcuts import redirect, render
from django.views.decorators.http import require_http_methods

from employee.models import Employee

logger = logging.getLogger(__name__)

User = get_user_model()

_NHAN_VIEN_GROUP = "Nhân Viên"
SESSION_KEY = "oidc_pending_signup"


def _get_or_create_nhan_vien_group():
    group, created = Group.objects.get_or_create(name=_NHAN_VIEN_GROUP)
    if created:
        logger.info("Created group '%s'", _NHAN_VIEN_GROUP)
    return group


@require_http_methods(["GET", "POST"])
def oidc_signup_view(request):
    claims = request.session.get(SESSION_KEY)
    if not claims:
        # No pending KC identity — go back to login
        return redirect("/login/?sso_error=1")

    if request.method == "GET":
        return render(request, "oidc/signup.html", {"claims": claims})

    # POST — validate and create
    first_name = request.POST.get("first_name", "").strip()
    last_name = request.POST.get("last_name", "").strip()
    email = request.POST.get("email", "").strip()
    phone = request.POST.get("phone", "").strip()

    errors = {}
    if not first_name:
        errors["first_name"] = "Vui lòng nhập họ."
    if not email:
        errors["email"] = "Vui lòng nhập email."
    if not phone:
        errors["phone"] = "Vui lòng nhập số điện thoại."
    if User.objects.filter(username=email).exists() or User.objects.filter(email=email).exists():
        errors["email"] = "Email này đã được sử dụng. Liên hệ quản trị viên để được hỗ trợ."
    if Employee.objects.filter(email=email).exists():
        errors["email"] = "Email nhân viên này đã tồn tại. Liên hệ quản trị viên."

    if errors:
        return render(request, "oidc/signup.html", {"claims": claims, "errors": errors,
                                                     "form": request.POST})

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=email,
                email=email,
                first_name=first_name,
                last_name=last_name,
                password=None,
            )
            user.is_active = True
            user.save()

            group = _get_or_create_nhan_vien_group()
            user.groups.add(group)

            Employee.objects.create(
                employee_user_id=user,
                employee_first_name=first_name,
                employee_last_name=last_name or "",
                email=email,
                phone=phone,
            )

        del request.session[SESSION_KEY]

        # Log the user in using the OIDC backend so session is set correctly
        backend = "horilla.oidc_backend.HorillaOIDCBackend"
        login(request, user, backend=backend)
        logger.info(
            "OIDC auto-signup complete: user=%r email=%r sub=%r",
            user.username, email, claims.get("sub", ""),
        )
        messages.success(
            request,
            f"Chào mừng {first_name}! Tài khoản của bạn đã được tạo thành công.",
        )
        return redirect("/")

    except Exception as exc:
        logger.error("OIDC signup failed: %s", exc, exc_info=True)
        messages.error(request, "Đã xảy ra lỗi khi tạo tài khoản. Vui lòng thử lại.")
        return render(request, "oidc/signup.html", {"claims": claims, "form": request.POST})
