import re

MOBILE_UA_RE = re.compile(
    r"Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet",
    re.IGNORECASE,
)

SKIP_PREFIXES = (
    "/pwa/",
    "/bff/",
    "/api/",
    "/static/",
    "/media/",
    "/oidc/",
    "/admin/",
    "/deeplink/",
    "/login",
)


class MobileRedirectMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path

        if any(path.startswith(p) for p in SKIP_PREFIXES):
            return self.get_response(request)

        if request.COOKIES.get("prefer_desktop") == "1":
            return self.get_response(request)

        ua = request.META.get("HTTP_USER_AGENT", "")
        if MOBILE_UA_RE.search(ua):
            from django.shortcuts import redirect

            return redirect("/pwa/")

        return self.get_response(request)
