from django.db.models import Count, Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from employee.models import Employee
from project.models import Project, ProjectStage, Task


def _get_employee(user):
    try:
        return user.employee_get
    except Exception:
        return None


class MyProjectsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        emp = _get_employee(request.user)
        if not emp:
            return Response([])

        qs = Project.objects.filter(
            Q(managers=emp) | Q(members=emp),
            is_active=True,
        ).distinct().annotate(
            task_count=Count("task", distinct=True),
            task_done=Count(
                "task",
                filter=Q(task__status="completed"),
                distinct=True,
            ),
            member_count=Count("members", distinct=True),
        ).order_by("-start_date")

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        items = []
        for p in qs[:50]:
            items.append({
                "id": p.id,
                "title": p.title,
                "status": p.status,
                "status_label": p.get_status_display(),
                "start_date": p.start_date.isoformat() if p.start_date else None,
                "end_date": p.end_date.isoformat() if p.end_date else None,
                "description": p.get_description(100),
                "task_count": p.task_count,
                "task_done": p.task_done,
                "member_count": p.member_count,
                "is_manager": emp in p.managers.all(),
            })
        return Response(items)


class ProjectDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        emp = _get_employee(request.user)
        project = Project.objects.filter(pk=pk, is_active=True).first()
        if not project:
            return Response({"error": "Not found"}, status=404)

        is_manager = emp and emp in project.managers.all()
        is_member = emp and (
            emp in project.members.all()
            or emp in project.managers.all()
        )

        if not is_member and not request.user.has_perm("project.view_project"):
            return Response({"error": "Forbidden"}, status=403)

        stages = ProjectStage.objects.filter(
            project=project, is_active=True
        ).order_by("sequence")

        tasks = Task.objects.filter(
            project=project, is_active=True
        ).order_by("stage__sequence", "sequence")

        stage_list = []
        for s in stages:
            stage_tasks = [t for t in tasks if t.stage_id == s.id]
            stage_list.append({
                "id": s.id,
                "title": s.title,
                "sequence": s.sequence,
                "is_end_stage": s.is_end_stage,
                "tasks": [_serialize_task(t, emp) for t in stage_tasks],
            })

        managers = [
            {"id": m.id, "name": m.get_full_name()}
            for m in project.managers.all()
        ]
        members = [
            {"id": m.id, "name": m.get_full_name()}
            for m in project.members.all()
        ]

        return Response({
            "id": project.id,
            "title": project.title,
            "status": project.status,
            "status_label": project.get_status_display(),
            "start_date": project.start_date.isoformat() if project.start_date else None,
            "end_date": project.end_date.isoformat() if project.end_date else None,
            "description": project.description,
            "managers": managers,
            "members": members,
            "is_manager": is_manager,
            "stages": stage_list,
        })


def _serialize_task(task, emp=None):
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "status_label": task.get_status_display(),
        "start_date": task.start_date.isoformat() if task.start_date else None,
        "end_date": task.end_date.isoformat() if task.end_date else None,
        "description": task.description[:200] if task.description else "",
        "stage_id": task.stage_id,
        "managers": [m.get_full_name() for m in task.task_managers.all()],
        "members": [m.get_full_name() for m in task.task_members.all()],
        "is_my_task": emp is not None and (
            emp in task.task_managers.all() or emp in task.task_members.all()
        ),
    }


class TaskUpdateStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        emp = _get_employee(request.user)
        task = Task.objects.filter(pk=pk, is_active=True).first()
        if not task:
            return Response({"error": "Not found"}, status=404)

        can_edit = emp and (
            emp in task.task_managers.all()
            or emp in task.task_members.all()
            or emp in task.project.managers.all()
        )
        if not can_edit and not request.user.has_perm("project.change_task"):
            return Response({"error": "Forbidden"}, status=403)

        new_status = request.data.get("status")
        new_stage_id = request.data.get("stage_id")

        if new_status and new_status in dict(Task.TASK_STATUS):
            task.status = new_status

        if new_stage_id:
            stage = ProjectStage.objects.filter(
                id=new_stage_id, project=task.project
            ).first()
            if stage:
                task.stage = stage

        task.save()
        return Response(_serialize_task(task, emp))
