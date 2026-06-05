from django.db import migrations


def add_leave_management(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="leave-management",
        defaults=dict(
            label="Quản lý Phép",
            group="manage",
            is_base=False,
            order=266,
            is_active=True,
        ),
    )


def remove_leave_management(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="leave-management").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0013_appfeature_shift_management"),
    ]

    operations = [
        migrations.RunPython(add_leave_management, remove_leave_management),
    ]
