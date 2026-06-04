"""
REST API views for the Helpdesk module (PWA).
Provides: ticket types, ticket CRUD, comments, attachments, status changes.
"""

from datetime import date

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.contrib.auth import get_user_model

from helpdesk.models import TICKET_STATUS, Attachment, Comment, Ticket, TicketType

# Tất cả ticket từ PWA route về tài khoản xử lý chính
HELPDESK_HANDLER_EMAIL = "coo@hongngocha.com"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ticket_brief(ticket):
    """Lightweight dict — used in list views."""
    try:
        ticket_id = f"{ticket.ticket_type.prefix}-{ticket.pk:03d}"
    except Exception:
        ticket_id = str(ticket.pk)
    return {
        "id": ticket.id,
        "ticket_id": ticket_id,
        "title": ticket.title,
        "ticket_type": {
            "id": ticket.ticket_type_id,
            "title": ticket.ticket_type.title if ticket.ticket_type else "",
            "type": ticket.ticket_type.type if ticket.ticket_type else "",
        } if ticket.ticket_type_id else None,
        "priority": ticket.priority,
        "status": ticket.status,
        "status_display": ticket.get_status_display(),
        "created_date": str(ticket.created_date),
        "deadline": str(ticket.deadline) if ticket.deadline else None,
        "comment_count": ticket.comment.count(),
        "attachment_count": ticket.ticket_attachment.count(),
        "employee_name": ticket.employee_id.get_full_name() if ticket.employee_id else "",
    }


def _ticket_detail(ticket):
    """Full dict — used in detail view."""
    d = _ticket_brief(ticket)
    d["description"] = ticket.description or ""
    d["resolved_date"] = str(ticket.resolved_date) if ticket.resolved_date else None
    d["assigned_to"] = [
        {"id": a.id, "name": a.get_full_name()}
        for a in ticket.assigned_to.all()
    ]
    d["comments"] = [
        {
            "id": c.id,
            "comment": c.comment,
            "author": c.employee_id.get_full_name() if c.employee_id else "?",
            "author_id": c.employee_id_id,
            "date": c.date.strftime("%Y-%m-%d %H:%M") if c.date else "",
            "attachments": [
                {"id": a.id, "url": a.file.url, "format": a.format or "file", "name": str(a)}
                for a in c.comment_attachment.all()
            ],
        }
        for c in ticket.comment.filter(is_active=True).order_by("date")
    ]
    d["attachments"] = [
        {"id": a.id, "url": a.file.url, "format": a.format or "file", "name": str(a)}
        for a in ticket.ticket_attachment.filter(is_active=True)
    ]
    return d


def _can_view(emp, ticket, user):
    return (
        ticket.employee_id_id == emp.id
        or user.has_perm("helpdesk.view_ticket")
        or emp in ticket.assigned_to.all()
    )


def _can_change(emp, ticket, user):
    return (
        ticket.employee_id_id == emp.id
        or user.has_perm("helpdesk.change_ticket")
        or emp in ticket.assigned_to.all()
    )


# ── Views ──────────────────────────────────────────────────────────────────────

class TicketTypeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        types = TicketType.objects.filter(is_active=True).order_by("title")
        return Response([
            {"id": t.id, "title": t.title, "type": t.type, "prefix": t.prefix}
            for t in types
        ])


class TicketListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        emp = request.user.employee_get
        tab = request.GET.get("tab", "mine")
        status_filter = request.GET.get("status", "")
        is_manager = request.user.has_perm("helpdesk.view_ticket")

        if tab == "all" and is_manager:
            qs = Ticket.objects.filter(is_active=True)
        else:
            qs = Ticket.objects.filter(employee_id=emp, is_active=True)

        if status_filter:
            qs = qs.filter(status__in=status_filter.split(","))

        qs = qs.select_related("ticket_type", "employee_id").order_by("-created_date")
        results = [_ticket_brief(t) for t in qs]
        return Response({"count": len(results), "results": results, "is_manager": is_manager})

    def post(self, request):
        emp = request.user.employee_get
        title = (request.data.get("title") or "").strip()
        ticket_type_id = request.data.get("ticket_type")
        priority = request.data.get("priority", "low")
        description = request.data.get("description", "")
        deadline = request.data.get("deadline") or None

        if not title:
            return Response({"error": "Tiêu đề không được để trống"}, status=400)
        if not ticket_type_id:
            return Response({"error": "Vui lòng chọn loại yêu cầu"}, status=400)

        try:
            ticket_type = TicketType.objects.get(id=ticket_type_id, is_active=True)
        except TicketType.DoesNotExist:
            return Response({"error": "Loại yêu cầu không tồn tại"}, status=400)

        # Route ticket về tài khoản xử lý cố định
        try:
            User = get_user_model()
            handler_user = User.objects.get(email=HELPDESK_HANDLER_EMAIL)
            handler_emp = handler_user.employee_get
            assigning_type, raised_on = "individual", str(handler_emp.id)
        except Exception:
            # Fallback: route về phòng ban người gửi nếu không tìm thấy handler
            dept = emp.get_department()
            if dept:
                assigning_type, raised_on = "department", str(dept.id)
            else:
                assigning_type, raised_on = "individual", str(emp.id)

        ticket = Ticket.objects.create(
            title=title,
            employee_id=emp,
            ticket_type=ticket_type,
            priority=priority,
            description=description,
            deadline=deadline,
            assigning_type=assigning_type,
            raised_on=raised_on,
            status="new",
        )

        for f in request.FILES.getlist("files"):
            Attachment.objects.create(ticket=ticket, file=f)

        return Response(_ticket_detail(ticket), status=201)


class TicketDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, pk):
        try:
            return Ticket.objects.get(id=pk, is_active=True)
        except Ticket.DoesNotExist:
            return None

    def get(self, request, pk):
        emp = request.user.employee_get
        ticket = self._get(pk)
        if not ticket:
            return Response({"error": "Không tìm thấy"}, status=404)
        if not _can_view(emp, ticket, request.user):
            return Response({"error": "Không có quyền xem"}, status=403)
        return Response(_ticket_detail(ticket))

    def patch(self, request, pk):
        emp = request.user.employee_get
        ticket = self._get(pk)
        if not ticket:
            return Response({"error": "Không tìm thấy"}, status=404)
        if not _can_change(emp, ticket, request.user):
            return Response({"error": "Không có quyền"}, status=403)

        new_status = request.data.get("status")
        if new_status and new_status in dict(TICKET_STATUS):
            ticket.status = new_status
            if new_status == "resolved" and not ticket.resolved_date:
                ticket.resolved_date = date.today()
            ticket.save()

        return Response(_ticket_detail(ticket))

    def delete(self, request, pk):
        emp = request.user.employee_get
        ticket = self._get(pk)
        if not ticket:
            return Response({"error": "Không tìm thấy"}, status=404)
        if ticket.employee_id_id != emp.id and not request.user.has_perm("helpdesk.delete_ticket"):
            return Response({"error": "Không có quyền xóa"}, status=403)
        if ticket.status != "new":
            return Response({"error": "Chỉ xóa được yêu cầu mới (chưa xử lý)"}, status=400)
        ticket.delete()
        return Response(status=204)


class TicketCommentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        emp = request.user.employee_get
        try:
            ticket = Ticket.objects.get(id=pk, is_active=True)
        except Ticket.DoesNotExist:
            return Response({"error": "Không tìm thấy"}, status=404)

        if not _can_view(emp, ticket, request.user):
            return Response({"error": "Không có quyền"}, status=403)

        text = (request.data.get("comment") or "").strip()
        if not text:
            return Response({"error": "Nội dung không được để trống"}, status=400)

        comment = Comment.objects.create(ticket=ticket, employee_id=emp, comment=text)

        for f in request.FILES.getlist("files"):
            Attachment.objects.create(comment=comment, file=f)

        return Response({
            "id": comment.id,
            "comment": comment.comment,
            "author": emp.get_full_name(),
            "author_id": emp.id,
            "date": comment.date.strftime("%Y-%m-%d %H:%M") if comment.date else "",
            "attachments": [
                {"id": a.id, "url": a.file.url, "format": a.format or "file", "name": str(a)}
                for a in comment.comment_attachment.all()
            ],
        }, status=201)
