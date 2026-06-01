from django.conf import settings
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.models import PushSubscription

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
        return Response({"unread": unread, "total": total})


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
