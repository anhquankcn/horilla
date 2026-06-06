from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect
from django.views.decorators.clickjacking import xframe_options_exempt


@xframe_options_exempt
@login_required
def labelday_deeplink(request):
    """Embed the Gán lịch bận (hrm-wds-labelday) page inside the PWA iframe."""
    qs = request.GET.urlencode()
    url = "/eoffice/labelday/" + (f"?{qs}" if qs else "")
    return redirect(url)


@xframe_options_exempt
@login_required
def task_deeplink(request):
    """
    Redirect authenticated user to the external task system (1StopShop).
    If TASK_KC_CLIENT_ID is configured, constructs a Keycloak auth URL with
    login_hint so the user is auto-authenticated via SSO without any prompt.
    Otherwise, redirects to the task system URL directly.
    """
    task_url = getattr(settings, "TASK_SYSTEM_URL", "https://task.hnhtravel.work")
    client_id = getattr(settings, "TASK_KC_CLIENT_ID", "")

    if not client_id:
        return redirect(task_url)

    kc_base = getattr(settings, "KC_BASE", "")
    auth_endpoint = f"{kc_base}/protocol/openid-connect/auth"

    params = {
        "client_id": client_id,
        "redirect_uri": task_url,
        "response_type": "code",
        "scope": "openid email profile",
    }

    email = getattr(request.user, "email", "")
    if email:
        params["login_hint"] = email

    return redirect(f"{auth_endpoint}?{urlencode(params)}")
