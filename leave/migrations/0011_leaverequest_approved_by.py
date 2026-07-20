import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employee", "0007_hnh_profile_password_reset_tracking"),
        ("leave", "0010_leave_approved_at_and_cb_seen"),
    ]

    operations = [
        migrations.AddField(
            model_name="leaverequest",
            name="approved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="leave_request_approved",
                to="employee.employee",
                verbose_name="Approved By",
            ),
        ),
        migrations.AddField(
            model_name="historicalleaverequest",
            name="approved_by",
            field=models.ForeignKey(
                blank=True,
                db_constraint=False,
                editable=False,
                null=True,
                on_delete=django.db.models.deletion.DO_NOTHING,
                related_name="+",
                to="employee.employee",
                verbose_name="Approved By",
            ),
        ),
    ]
