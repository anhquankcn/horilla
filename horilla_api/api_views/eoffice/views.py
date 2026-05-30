from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from eoffice.models import WorkTask


class MyTaskSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = getattr(request.user, "employee_get", None)
        if not employee:
            return Response({"error": "No employee profile"}, status=404)

        today = timezone.localdate()
        my = WorkTask.objects.filter(assigned_to=employee, is_active=True)

        counts = my.aggregate(
            total=Count("id"),
            to_do=Count("id", filter=Q(status="to_do")),
            in_progress=Count("id", filter=Q(status="in_progress")),
            done=Count("id", filter=Q(status="done")),
            blocked=Count("id", filter=Q(status="blocked")),
            overdue=Count(
                "id",
                filter=Q(due_date__lt=today, status__in=["to_do", "in_progress"]),
            ),
        )

        recent = (
            my.exclude(status="done")
            .select_related("department")
            .order_by("due_date", "-priority")[:5]
        )
        recent_list = [
            {
                "id": t.pk,
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "overdue_days": t.overdue_days,
                "department": str(t.department) if t.department else None,
            }
            for t in recent
        ]

        return Response({**counts, "recent_tasks": recent_list})
