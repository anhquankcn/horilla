from django.db import migrations


def add_leave_approver_config(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="leave-approver-config",
        defaults=dict(
            label="Cấu hình duyệt phép",
            group="manage",
            is_base=False,
            order=268,
            is_active=True,
        ),
    )


def remove_leave_approver_config(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="leave-approver-config").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0039_outlooktoken"),
    ]

    operations = [
        migrations.RunPython(add_leave_approver_config, remove_leave_approver_config),
    ]
