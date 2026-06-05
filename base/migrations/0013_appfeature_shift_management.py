from django.db import migrations


def add_shift_management(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="shift-management",
        defaults=dict(
            label="Quản lý Ca",
            group="manage",
            is_base=False,
            order=265,
            is_active=True,
        ),
    )


def remove_shift_management(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="shift-management").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0012_departmentshift"),
    ]

    operations = [
        migrations.RunPython(add_shift_management, remove_shift_management),
    ]
