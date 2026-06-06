"""horilla URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path
from django.views.i18n import JavaScriptCatalog
from mozilla_django_oidc.views import OIDCLogoutView

import notifications.urls

from . import settings
from .oidc_backend import HorillaOIDCCallbackView, HorillaOIDCRequestView
from .deeplink_views import task_deeplink, labelday_deeplink
from .oidc_signup_views import oidc_signup_view


def health_check(request):
    return JsonResponse({"status": "ok"}, status=200)


urlpatterns = [
    path("admin/", admin.site.urls),
    # OIDC — callback uses custom view that redirects to login on state mismatch
    path("oidc/callback/", HorillaOIDCCallbackView.as_view(), name="oidc_authentication_callback"),
    path("oidc/authenticate/", HorillaOIDCRequestView.as_view(), name="oidc_authentication_init"),
    path("oidc/logout/", OIDCLogoutView.as_view(), name="oidc_logout"),
    path("oidc/signup/", oidc_signup_view, name="oidc_signup"),
    path("accounts/", include("django.contrib.auth.urls")),
    path("accounts/", include("django.contrib.auth.urls")),
    path("", include("base.urls")),
    path("", include("horilla_automations.urls")),
    path("", include("horilla_views.urls")),
    path("employee/", include("employee.urls")),
    path("horilla-widget/", include("horilla_widgets.urls")),
    re_path(
        "^inbox/notifications/", include(notifications.urls, namespace="notifications")
    ),
    path("i18n/", include("django.conf.urls.i18n")),
    path("jsi18n/", JavaScriptCatalog.as_view(), name="javascript-catalog"),
    path("health/", health_check),
    path("deeplink/tasks/", task_deeplink, name="deeplink-tasks"),
    path("deeplink/labelday/", labelday_deeplink, name="deeplink-labelday"),
]


def _register_profile_tabs_once(sender, **kwargs):
    """Register all HorillaProfileView tab URLs on the first request,
    after every AppConfig.ready() has run and all add_tab() calls are done."""
    from django.core.signals import request_started

    request_started.disconnect(_register_profile_tabs_once)

    from horilla_views.generic.cbv.views import HorillaProfileView

    HorillaProfileView.register_tab_urls(urlpatterns)


from django.core.signals import request_started

request_started.connect(_register_profile_tabs_once)

# if settings.DEBUG:
#     urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
