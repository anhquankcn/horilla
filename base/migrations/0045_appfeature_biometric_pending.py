from django.db import migrations


def add_biometric_pending(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="biometric-pending",
        defaults=dict(
            label="Chấm công chưa khớp",
            group="manage",
            is_base=False,
            order=280,
            is_active=True,
        ),
    )


def remove_biometric_pending(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="biometric-pending").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0044_appfeature_request_list"),
    ]

    operations = [
        migrations.RunPython(add_biometric_pending, remove_biometric_pending),
    ]
