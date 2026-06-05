from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def add_hnh_leave_types(apps, schema_editor):
    LeaveType = apps.get_model("leave", "LeaveType")
    Company = apps.get_model("base", "Company")
    company = Company.objects.first()

    LeaveType.objects.get_or_create(
        name="Phép Bù",
        defaults=dict(
            payment="paid",
            total_days=0,
            is_compensatory_leave=True,
            require_approval="yes",
        ),
    )
    LeaveType.objects.get_or_create(
        name="Phép Thâm Niên",
        defaults=dict(
            payment="paid",
            total_days=0,
            require_approval="yes",
        ),
    )


def remove_hnh_leave_types(apps, schema_editor):
    LeaveType = apps.get_model("leave", "LeaveType")
    LeaveType.objects.filter(name__in=["Phép Bù", "Phép Thâm Niên"]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("leave", "0002_alter_availableleave_created_at_and_more"),
        ("employee", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="HNHCompensatoryProposal",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, null=True)),
                ("days", models.FloatField(verbose_name="Days")),
                ("note", models.TextField(blank=True, default="", verbose_name="Note")),
                ("status", models.CharField(
                    choices=[("requested", "Requested"), ("approved", "Approved"), ("rejected", "Rejected")],
                    default="requested",
                    max_length=20,
                    verbose_name="Status",
                )),
                ("reject_reason", models.TextField(blank=True, default="")),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("employee_id", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="compensatory_proposals",
                    to="employee.employee",
                    verbose_name="Employee",
                )),
                ("proposed_by", models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="created_compensatory_proposals",
                    to="employee.employee",
                    verbose_name="Proposed by",
                )),
                ("approved_by", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="approved_compensatory_proposals",
                    to="employee.employee",
                    verbose_name="Approved by",
                )),
            ],
            options={
                "verbose_name": "Phép Bù Proposal",
                "verbose_name_plural": "Phép Bù Proposals",
                "db_table": "leave_hnh_compensatory_proposal",
                "ordering": ["-id"],
            },
        ),
        migrations.RunPython(add_hnh_leave_types, remove_hnh_leave_types),
    ]
