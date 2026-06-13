import logging

import requests as http_requests
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from ...api_serializers.auth.serializers import GetEmployeeSerializer

logger = logging.getLogger(__name__)
User = get_user_model()


def _build_employee_response(user):
    """Build the standard login response with employee data and SimpleJWT."""
    refresh = RefreshToken.for_user(user)
    employee = user.employee_get
    face_detection = False
    face_detection_image = None
    geo_fencing = False
    company_id = None
    try:
        face_detection = employee.get_company().face_detection.start
    except Exception:
        pass
    try:
        geo_fencing = employee.get_company().geo_fencing.start
    except Exception:
        pass
    try:
        face_detection_image = employee.face_detection.image.url
    except Exception:
        pass
    try:
        company_id = employee.get_company().id
    except Exception:
        pass
    return {
        "employee": GetEmployeeSerializer(employee).data,
        "access": str(refresh.access_token),
        "face_detection": face_detection,
        "face_detection_image": face_detection_image,
        "geo_fencing": geo_fencing,
        "company_id": company_id,
    }


class LoginAPIView(APIView):
    def post(self, request):
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "").strip()
        if not username or not password:
            return Response({"error": "Please provide Username and Password"}, status=400)
        user = authenticate(username=username, password=password)
        if not user:
            return Response({"error": "Invalid credentials"}, status=401)
        try:
            data = _build_employee_response(user)
        except Exception as exc:
            logger.error("Login response build failed for user %s: %s", username, exc)
            return Response({"error": "Account setup incomplete — no employee profile linked"}, status=500)
        return Response(data, status=200)


class OIDCLoginAPIView(APIView):
    """Accept a Keycloak access_token from the mobile app, validate it via
    Keycloak userinfo endpoint, map to a Horilla user, and return a SimpleJWT
    token + employee data (same format as LoginAPIView)."""

    authentication_classes = []
    permission_classes = []

    def post(self, request):
        kc_access_token = request.data.get("access_token", "").strip()
        if not kc_access_token:
            return Response(
                {"error": "access_token is required"}, status=400
            )

        kc_base = getattr(settings, "KC_BASE", "")
        if not kc_base:
            return Response(
                {"error": "OIDC not configured on server"}, status=500
            )

        userinfo_url = f"{kc_base}/protocol/openid-connect/userinfo"
        try:
            resp = http_requests.get(
                userinfo_url,
                headers={"Authorization": f"Bearer {kc_access_token}"},
                timeout=5,
            )
        except http_requests.RequestException:
            return Response(
                {"error": "Cannot reach Keycloak server"}, status=502
            )

        if resp.status_code != 200:
            logger.warning(
                "OIDC mobile login: Keycloak userinfo returned %s", resp.status_code
            )
            return Response(
                {"error": "Invalid or expired Keycloak token"}, status=401
            )

        claims = resp.json()
        email = claims.get("email", "")
        kc_username = claims.get("preferred_username", "")

        user = None
        if email:
            user = User.objects.filter(email=email, is_active=True).first()
            if not user:
                user = User.objects.filter(username=email, is_active=True).first()
        if not user and kc_username:
            user = User.objects.filter(username=kc_username, is_active=True).first()

        if not user:
            logger.warning(
                "OIDC mobile login: no matching user — email=%r kc_username=%r",
                email, kc_username,
            )
            return Response(
                {"error": "No matching Horilla account for this Keycloak user"},
                status=403,
            )

        logger.info("OIDC mobile login success: user=%s", user.username)
        return Response(_build_employee_response(user), status=200)
