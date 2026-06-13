from django.db import migrations


def add_feature(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="wc2026",
        defaults={
            "label": "World Cup 2026",
            "group": "use",
            "is_base": True,
            "is_active": True,
            "order": 90,
        },
    )


def reverse(apps, schema_editor):
    apps.get_model("base", "AppFeature").objects.filter(slug="wc2026").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0031_appfeature_job_mgmt"),
    ]
    operations = [
        migrations.RunPython(add_feature, reverse),
    ]
