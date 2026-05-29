from django.db.models import Q
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from tourism.models import TourSchedule

from ...api_serializers.tourism.serializers import TourScheduleSerializer


class MyTourSchedulesView(APIView):
    """Tour schedules assigned to the current employee (as lead or support guide)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = request.user.employee_get
        guide = getattr(employee, "tour_guide_profile", None)
        if not guide:
            return Response({"count": 0, "results": []})

        qs = TourSchedule.objects.filter(
            Q(lead_guide=guide) | Q(support_guides=guide)
        ).select_related("tour", "lead_guide__employee").distinct().order_by("-start_date")

        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)

        pagination = PageNumberPagination()
        page = pagination.paginate_queryset(qs, request)
        serializer = TourScheduleSerializer(page, many=True)
        return pagination.get_paginated_response(serializer.data)


class TourScheduleListView(APIView):
    """All tour schedules (for managers / dashboard)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = TourSchedule.objects.select_related(
            "tour", "lead_guide__employee"
        ).order_by("-start_date")

        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)

        pagination = PageNumberPagination()
        page = pagination.paginate_queryset(qs, request)
        serializer = TourScheduleSerializer(page, many=True)
        return pagination.get_paginated_response(serializer.data)
