"""eoffice/forms.py"""

from django import forms
from django.utils.translation import gettext_lazy as _

from base.forms import ModelForm
from base.models import Department
from employee.models import Employee

from .models import TaskComment, WorkTask


class WorkTaskForm(ModelForm):
    """Form for creating and editing WorkTask instances."""

    cols = {"description": 12, "title": 12}

    class Meta:
        model = WorkTask
        fields = [
            "title",
            "description",
            "assigned_to",
            "department",
            "priority",
            "due_date",
            "recurrence_rule",
            "parent_task",
        ]
        widgets = {
            "due_date": forms.DateInput(attrs={"type": "date"}),
            "description": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, request=None, **kwargs):
        super().__init__(*args, **kwargs)
        # Only show active employees
        self.fields["assigned_to"].queryset = Employee.objects.filter(is_active=True).select_related(
            "employee_work_info"
        )
        # Restrict parent_task to existing active tasks (no sub-subtasks — depth 1)
        instance = kwargs.get("instance")
        parent_qs = WorkTask.objects.filter(is_active=True, parent_task__isnull=True)
        if instance and instance.pk:
            parent_qs = parent_qs.exclude(pk=instance.pk)
        self.fields["parent_task"].queryset = parent_qs
        self.fields["parent_task"].required = False
        self.fields["parent_task"].label = _("Thuộc công việc cha (tùy chọn)")

        # Status is managed via transition_status service — not on this create/edit form.
        # Blocked status is only reachable via the status-change view.

    def clean(self):
        cleaned = super().clean()
        recurrence = cleaned.get("recurrence_rule", "none")
        due_date = cleaned.get("due_date")
        if recurrence != "none" and not due_date:
            self.add_error("due_date", _("Deadline bắt buộc khi có lặp lại."))
        return cleaned


class TaskStatusForm(forms.Form):
    """Minimal form for the quick status-change dropdown on the kanban card."""

    status = forms.ChoiceField(choices=WorkTask.STATUS_CHOICES)
    reason = forms.CharField(required=False, widget=forms.Textarea(attrs={"rows": 2}))

    def clean(self):
        cleaned = super().clean()
        if cleaned.get("status") == "blocked" and not cleaned.get("reason", "").strip():
            self.add_error("reason", _("Lý do bị chặn là bắt buộc."))
        return cleaned


class TaskCommentForm(ModelForm):
    """Form for adding comments to a task."""

    class Meta:
        model = TaskComment
        fields = ["body"]
        widgets = {
            "body": forms.Textarea(attrs={"rows": 2, "placeholder": _("Thêm bình luận...")}),
        }
        labels = {"body": ""}
