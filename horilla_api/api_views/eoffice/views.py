from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from eoffice.models import WorkTask


class WorkTaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()
    department_name = serializers.CharField(source="department.department", read_only=True)
    overdue_days = serializers.IntegerField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = WorkTask
        fields = [
            "id", "title", "description", "status", "priority",
            "due_date", "assigned_to", "assigned_by", "department",
            "assigned_to_name", "assigned_by_name", "department_name",
            "overdue_days", "is_overdue", "completed_at",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "assigned_by", "created_at", "updated_at", "completed_at"]

    def get_assigned_to_name(self, obj):
        e = obj.assigned_to
        return f"{e.employee_first_name} {e.employee_last_name}" if e else None

    def get_assigned_by_name(self, obj):
        e = obj.assigned_by
        return f"{e.employee_first_name} {e.employee_last_name}" if e else None


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


class MyTaskListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employee = getattr(request.user, "employee_get", None)
        if not employee:
            return Response({"error": "No employee profile"}, status=404)

        qs = WorkTask.objects.filter(
            is_active=True,
        ).filter(
            Q(assigned_to=employee) | Q(assigned_by=employee)
        ).select_related("assigned_to", "assigned_by", "department").order_by("-updated_at")

        filter_status = request.query_params.get("status")
        if filter_status:
            qs = qs.filter(status=filter_status)

        serializer = WorkTaskSerializer(qs[:50], many=True)
        return Response(serializer.data)


class TaskDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        employee = getattr(request.user, "employee_get", None)
        task = WorkTask.objects.filter(pk=pk, is_active=True).select_related(
            "assigned_to", "assigned_by", "department"
        ).first()
        if not task:
            return Response({"error": "Not found"}, status=404)
        return Response(WorkTaskSerializer(task).data)

    def put(self, request, pk):
        employee = getattr(request.user, "employee_get", None)
        if not employee:
            return Response({"error": "No employee profile"}, status=404)
        task = WorkTask.objects.filter(pk=pk, is_active=True).first()
        if not task:
            return Response({"error": "Not found"}, status=404)

        data = request.data
        for field in ["title", "description", "priority", "due_date"]:
            if field in data:
                setattr(task, field, data[field] if data[field] != "" else None)

        if "status" in data:
            new_status = data["status"]
            if new_status == "done" and task.status != "done":
                task.completed_at = timezone.now()
            elif new_status != "done":
                task.completed_at = None
            task.status = new_status

        task.save()
        return Response(WorkTaskSerializer(task).data)

    def delete(self, request, pk):
        employee = getattr(request.user, "employee_get", None)
        if not employee:
            return Response({"error": "No employee profile"}, status=404)
        task = WorkTask.objects.filter(pk=pk, is_active=True).first()
        if not task:
            return Response({"error": "Not found"}, status=404)
        task.is_active = False
        task.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        employee = getattr(request.user, "employee_get", None)
        if not employee:
            return Response({"error": "No employee profile"}, status=404)

        data = request.data
        try:
            dept = None
            if data.get("department"):
                from base.models import Department
                dept = Department.objects.get(pk=data["department"])
            elif employee.employee_work_info:
                dept = employee.employee_work_info.department_id

            assigned_to = employee
            if data.get("assigned_to"):
                from employee.models import Employee
                assigned_to = Employee.objects.get(pk=data["assigned_to"])

            task = WorkTask(
                title=data["title"],
                description=data.get("description", ""),
                assigned_to=assigned_to,
                assigned_by=employee,
                department=dept,
                priority=data.get("priority", "normal"),
                due_date=data.get("due_date") or None,
                status="to_do",
            )
            task.save()
            return Response(WorkTaskSerializer(task).data, status=status.HTTP_201_CREATED)
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)
