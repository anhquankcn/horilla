"""API lịch: feed .ics cá nhân (subscribe), .ics từng sự kiện, quản lý token."""
import logging

from django.http import HttpResponse
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from base.models import CalendarToken
from . import ics

logger = logging.getLogger(__name__)


def _ics_response(body: str, filename: str) -> HttpResponse:
    resp = HttpResponse(body, content_type="text/calendar; charset=utf-8")
    resp["Content-Disposition"] = f'inline; filename="{filename}"'
    resp["Cache-Control"] = "private, max-age=1800"
    return resp


class CalendarFeedView(APIView):
    """Feed .ics cá nhân — xác thực bằng TOKEN trong URL (Outlook không gửi cookie).
    Công khai (AllowAny) nhưng token khó đoán + thu hồi được."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, token: str):
        token = (token or "").removesuffix(".ics")
        ct = CalendarToken.objects.filter(token=token, revoked=False).select_related("user").first()
        if not ct:
            return HttpResponse("Not found or revoked", status=404, content_type="text/plain")
        try:
            body = ics.build_user_feed(ct.user)
        except Exception as exc:
            logger.error("Calendar feed build error user=%s: %s", ct.user_id, exc, exc_info=True)
            return HttpResponse("Calendar error", status=500, content_type="text/plain")
        return _ics_response(body, "hnh-lich-nhan-su.ics")


class CalendarEventView(APIView):
    """Tải .ics 1 sự kiện (PA3 'Thêm vào lịch') — auth qua JWT/BFF."""

    permission_classes = [IsAuthenticated]

    def get(self, request, kind: str, pk: int):
        emp = getattr(request.user, "employee_get", None)
        vevent = None
        if kind == "leave":
            from leave.models import LeaveRequest
            lr = LeaveRequest.objects.filter(id=pk, status="approved").select_related("leave_type_id").first()
            # chỉ cho tải đơn của chính mình (hoặc có quyền xem)
            if lr and (lr.employee_id_id == getattr(emp, "id", None)
                       or request.user.has_perm("leave.view_leaverequest")):
                lt = getattr(lr.leave_type_id, "name", "Nghỉ phép")
                vevent = ics.build_vevent(
                    uid=f"leave-{lr.id}", start=lr.start_date, end=lr.end_date,
                    summary=f"Nghỉ phép: {lt}", description=str(lr.description or ""),
                    category="Nghỉ phép",
                )
        elif kind == "holiday":
            from base.models import Holidays
            h = Holidays.objects.filter(id=pk).first()
            if h:
                vevent = ics.build_vevent(
                    uid=f"holiday-{h.id}", start=h.start_date, end=h.end_date,
                    summary=f"Nghỉ lễ: {h.name}", category="Ngày lễ",
                )
        elif kind == "announcement":
            from base.models import Announcement
            a = Announcement.objects.filter(id=pk, expire_date__isnull=False).first()
            if a:
                vevent = ics.build_vevent(
                    uid=f"announce-{a.id}", start=a.expire_date, end=a.expire_date,
                    summary=f"Sự kiện: {a.title}", description=str(a.description or ""),
                    category="Sự kiện",
                )
        if not vevent:
            return Response({"error": "Không tìm thấy sự kiện"}, status=404)
        body = ics.build_calendar([vevent])
        resp = _ics_response(body, f"{kind}-{pk}.ics")
        resp["Content-Disposition"] = f'attachment; filename="{kind}-{pk}.ics"'
        return resp


class CalendarTokenView(APIView):
    """Quản lý token feed cá nhân: GET lấy token, POST tạo lại, DELETE thu hồi."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ct = CalendarToken.get_or_create_for(request.user)
        return Response({"token": ct.token, "feed_path": f"/bff/calendar/{ct.token}.ics"})

    def post(self, request):
        ct = CalendarToken.get_or_create_for(request.user)
        ct.regenerate()
        return Response({"token": ct.token, "feed_path": f"/bff/calendar/{ct.token}.ics"})

    def delete(self, request):
        ct = CalendarToken.objects.filter(user=request.user).first()
        if ct:
            ct.revoked = True
            ct.save(update_fields=["revoked"])
        return Response({"revoked": True})
