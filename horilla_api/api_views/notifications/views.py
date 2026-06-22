import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

from employee.models import Employee, EmployeeWorkInformation
from notifications.models import (
    Announcement,
    AnnouncementFeedback,
    AnnouncementLike,
    AnnouncementRecipient,
    PushSubscription,
)
from notifications.signals import notify

from ...api_serializers.notifications.serializers import NotificationSerializer


class NotificationPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 100


class NotificationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, type):
        if type == "all":
            queryset = request.user.notifications.filter(deleted=False)
        elif type == "unread":
            queryset = request.user.notifications.unread()
        else:
            queryset = request.user.notifications.all()

        pagination = NotificationPagination()
        page = pagination.paginate_queryset(queryset, request)
        serializer = NotificationSerializer(page, many=True)
        return pagination.get_paginated_response(serializer.data)


class NotificationReadDelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        obj = request.user.notifications.filter(id=id).first()
        if not obj:
            return Response({"error": "Not found"}, status=404)
        obj.mark_as_read()
        serializer = NotificationSerializer(obj)
        return Response(serializer.data, status=200)

    def delete(self, request, id):
        obj = request.user.notifications.filter(id=id).first()
        if not obj:
            return Response({"error": "Not found"}, status=404)
        obj.deleted = True
        obj.save()
        return Response({"status": "deleted"}, status=200)


class NotificationBulkReadDelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        obj = request.user.notifications.all()
        obj.mark_all_as_read()
        return Response({"status": "marked as read"}, status=200)

    def delete(self, request):
        obj = request.user.notifications.all()
        obj.mark_all_as_deleted()
        return Response({"status": "deleted"}, status=200)


class NotificationBulkDelUnreadMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        obj = request.user.notifications.unread()
        obj.mark_all_as_deleted()
        return Response({"status": "deleted"}, status=200)


class NotificationSummaryView(APIView):
    """Quick summary: unread count only (for badge)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        unread = request.user.notifications.unread().count()
        total = request.user.notifications.filter(deleted=False).count()
        ann_unread = AnnouncementRecipient.objects.filter(
            user=request.user, read=False
        ).count()
        return Response({
            "unread": unread,
            "total": total,
            "announcements_unread": ann_unread,
        })


class VapidPublicKeyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"public_key": settings.VAPID_PUBLIC_KEY})


class PushSubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        endpoint = request.data.get("endpoint")
        keys = request.data.get("keys", {})
        p256dh = keys.get("p256dh", "")
        auth = keys.get("auth", "")

        if not endpoint or not p256dh or not auth:
            return Response({"error": "Missing subscription data"}, status=400)

        PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={
                "user": request.user,
                "p256dh": p256dh,
                "auth": auth,
            },
        )
        return Response({"status": "subscribed"})

    def delete(self, request):
        endpoint = request.data.get("endpoint")
        if not endpoint:
            return Response({"error": "Missing endpoint"}, status=400)
        PushSubscription.objects.filter(
            user=request.user, endpoint=endpoint
        ).delete()
        return Response({"status": "unsubscribed"})


# ── Announcement Hub ──────────────────────────────────────────────


def _resolve_recipients(target_type, data):
    if target_type == Announcement.TARGET_INDIVIDUAL:
        user_id = data.get("user_id")
        if user_id:
            return Employee.objects.filter(
                id=user_id, is_active=True
            ).values_list("employee_user_id", flat=True)
        return []

    if target_type == Announcement.TARGET_MULTI:
        user_ids = data.get("user_ids", [])
        return Employee.objects.filter(
            id__in=user_ids, is_active=True
        ).values_list("employee_user_id", flat=True)

    if target_type == Announcement.TARGET_DEPARTMENT:
        dept_id = data.get("department_id")
        return EmployeeWorkInformation.objects.filter(
            department_id=dept_id,
            employee_id__is_active=True,
        ).values_list("employee_id__employee_user_id", flat=True)

    if target_type == Announcement.TARGET_COMPANY:
        company_id = data.get("company_id")
        if company_id:
            return EmployeeWorkInformation.objects.filter(
                company_id=company_id,
                employee_id__is_active=True,
            ).values_list("employee_id__employee_user_id", flat=True)
        return Employee.objects.filter(
            is_active=True
        ).values_list("employee_user_id", flat=True)

    return []


def _serialize_announcement(ann, include_feedback=False, *, like_count=None, my_like=None):
    if ann.send_as_system:
        sender_display = "HRM System"
    elif hasattr(ann.sender, "employee_get"):
        sender_display = str(ann.sender.employee_get)
    else:
        sender_display = str(ann.sender)

    result = {
        "id": ann.id,
        "title": ann.title,
        "body": ann.body,
        "pinned": ann.pinned,
        "target_type": ann.target_type,
        "target_label": ann.get_target_type_display(),
        "target_department": (
            str(ann.target_department) if ann.target_department else None
        ),
        "target_company": (
            str(ann.target_company) if ann.target_company else None
        ),
        "send_as_system": ann.send_as_system,
        "sender_name": sender_display,
        "created_at": ann.created_at.isoformat(),
        "recipient_count": ann.recipients.count(),
        "read_count": ann.recipients.filter(read=True).count(),
        "feedback_count": ann.feedbacks.count(),
        "like_count": like_count if like_count is not None else ann.likes.count(),
        "my_like": bool(my_like) if my_like is not None else False,
        "image_url": ann.image.url if ann.image else None,
    }
    if include_feedback:
        result["feedbacks"] = [
            {
                "id": fb.id,
                "user_name": (
                    str(fb.user.employee_get)
                    if hasattr(fb.user, "employee_get")
                    else str(fb.user)
                ),
                "message": fb.message,
                "created_at": fb.created_at.isoformat(),
            }
            for fb in ann.feedbacks.select_related("user").all()[:50]
        ]
        result["recipients_detail"] = [
            {
                "user_name": (
                    str(r.user.employee_get)
                    if hasattr(r.user, "employee_get")
                    else str(r.user)
                ),
                "read": r.read,
                "read_at": r.read_at.isoformat() if r.read_at else None,
            }
            for r in ann.recipients.select_related("user").all()[:100]
        ]
    return result


class AnnouncementCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        title = request.data.get("title", "").strip()
        body = request.data.get("body", "").strip()
        target_type = request.data.get("target_type")

        if not title or not body or not target_type:
            return Response(
                {"error": "Thiếu tiêu đề, nội dung hoặc đối tượng"},
                status=400,
            )

        try:
            return self._do_send(request, title, body, target_type)
        except Exception:
            logger.exception("Announcement send failed")
            return Response(
                {"error": "Lỗi hệ thống khi gửi thông báo"}, status=500
            )

    def _do_send(self, request, title, body, target_type):
        dept_id = request.data.get("department_id")
        company_id = request.data.get("company_id")

        from base.models import Company, Department

        send_as_system = bool(request.data.get("send_as_system", False))

        pinned = bool(request.data.get("pinned", False))
        ann = Announcement.objects.create(
            sender=request.user,
            title=title,
            body=body,
            target_type=target_type,
            send_as_system=send_as_system,
            pinned=pinned,
            image=request.FILES.get("image") or None,
            target_department=(
                Department.objects.filter(id=dept_id).first()
                if dept_id
                else None
            ),
            target_company=(
                Company.objects.filter(id=company_id).first()
                if company_id
                else None
            ),
        )

        # For multi_user, FormData sends repeated user_ids keys; getlist collects all values.
        resolve_data = request.data
        if target_type == Announcement.TARGET_MULTI:
            raw = (
                request.data.getlist("user_ids")
                if hasattr(request.data, "getlist")
                else request.data.get("user_ids", [])
            )
            if isinstance(raw, str):
                raw = [raw]
            resolve_data = {"user_ids": raw}
        user_ids = list(_resolve_recipients(target_type, resolve_data))
        user_ids_set = {uid for uid in user_ids if uid is not None}

        from django.contrib.auth import get_user_model
        User = get_user_model()
        recipients = []
        for uid in user_ids_set:
            recipients.append(
                AnnouncementRecipient(announcement=ann, user_id=uid)
            )
        if recipients:
            AnnouncementRecipient.objects.bulk_create(
                recipients, ignore_conflicts=True
            )

        recipient_users = list(User.objects.filter(id__in=user_ids_set))
        if recipient_users:
            actor = request.user.employee_get if hasattr(request.user, "employee_get") else request.user
            sender_label = "HRM System" if send_as_system else str(actor)
            notify.send(
                actor,
                recipient=recipient_users,
                verb=f"[{sender_label}] {title}",
                description=body[:200],
                redirect="/",
                icon="chatbubbles",
            )

        return Response(_serialize_announcement(ann), status=201)


class AnnouncementHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Announcement.objects.filter(sender=request.user)
        items = [_serialize_announcement(a) for a in qs[:50]]
        return Response(items)


class AnnouncementReceivedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        recs = (
            AnnouncementRecipient.objects.filter(user=request.user)
            .select_related("announcement", "announcement__sender")
            .order_by("-announcement__created_at")[:50]
        )
        items = []
        for r in recs:
            ann = r.announcement
            items.append(
                {
                    **_serialize_announcement(ann),
                    "read": r.read,
                    "read_at": r.read_at.isoformat() if r.read_at else None,
                }
            )
        return Response(items)


class AnnouncementDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        ann = Announcement.objects.filter(pk=pk).first()
        if not ann:
            return Response({"error": "Not found"}, status=404)

        is_sender = ann.sender == request.user
        is_recipient = ann.recipients.filter(user=request.user).exists()
        if not is_sender and not is_recipient:
            return Response({"error": "Forbidden"}, status=403)

        if is_recipient:
            ann.recipients.filter(user=request.user, read=False).update(
                read=True, read_at=timezone.now()
            )

        return Response(
            {
                **_serialize_announcement(ann, include_feedback=is_sender),
                "is_sender": is_sender,
                "my_feedback": None
                if is_sender
                else (
                    {
                        "message": fb.message,
                        "created_at": fb.created_at.isoformat(),
                    }
                    if (
                        fb := ann.feedbacks.filter(user=request.user).first()
                    )
                    else None
                ),
            }
        )


class AnnouncementFeedbackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        ann = Announcement.objects.filter(pk=pk).first()
        if not ann:
            return Response({"error": "Not found"}, status=404)

        if not ann.recipients.filter(user=request.user).exists():
            return Response({"error": "Forbidden"}, status=403)

        message = request.data.get("message", "").strip()
        if not message:
            return Response({"error": "Thiếu nội dung phản hồi"}, status=400)

        fb, created = AnnouncementFeedback.objects.update_or_create(
            announcement=ann,
            user=request.user,
            defaults={"message": message},
        )

        actor = request.user.employee_get if hasattr(request.user, "employee_get") else request.user
        notify.send(
            actor,
            recipient=[ann.sender],
            verb=f"Phản hồi thông báo: {ann.title}",
            description=message[:200],
            redirect="/",
            icon="chatbubbles",
        )

        return Response(
            {
                "id": fb.id,
                "message": fb.message,
                "created_at": fb.created_at.isoformat(),
            },
            status=201 if created else 200,
        )


class AnnouncementFeedView(APIView):
    """Company-wide feed for the current user. Pinned first, then chronological."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        page_size = min(int(request.query_params.get("page_size", 20)), 50)
        page = max(int(request.query_params.get("page", 1)), 1)
        offset = (page - 1) * page_size

        qs = (
            AnnouncementRecipient.objects.filter(user=request.user)
            .select_related(
                "announcement",
                "announcement__sender",
                "announcement__target_department",
                "announcement__target_company",
            )
            .annotate(
                ann_like_count=Count("announcement__likes"),
                ann_my_like=Exists(
                    AnnouncementLike.objects.filter(
                        announcement=OuterRef("announcement_id"),
                        user=request.user,
                    )
                ),
            )
            .order_by("-announcement__pinned", "-announcement__created_at")
        )

        total = qs.count()
        recs = qs[offset : offset + page_size]

        items = []
        for r in recs:
            ann = r.announcement
            items.append(
                {
                    **_serialize_announcement(
                        ann,
                        like_count=r.ann_like_count,
                        my_like=r.ann_my_like,
                    ),
                    "read": r.read,
                    "read_at": r.read_at.isoformat() if r.read_at else None,
                }
            )

        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "results": items,
            }
        )


class AnnouncementLikeView(APIView):
    """Toggle like on an announcement. Returns {liked, count}."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        ann = Announcement.objects.filter(pk=pk).first()
        if not ann:
            return Response({"error": "Not found"}, status=404)

        if not ann.recipients.filter(user=request.user).exists():
            return Response({"error": "Forbidden"}, status=403)

        obj, created = AnnouncementLike.objects.get_or_create(
            announcement=ann, user=request.user
        )
        if not created:
            obj.delete()

        like_count = ann.likes.count()
        return Response({"liked": created, "count": like_count})


class AnnouncementTargetsView(APIView):
    """Returns departments and companies for the target picker."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from base.models import Company, Department

        departments = Department.objects.all().values("id", "department")
        companies = Company.objects.all().values("id", "company")

        return Response(
            {
                "departments": list(departments),
                "companies": list(companies),
            }
        )
