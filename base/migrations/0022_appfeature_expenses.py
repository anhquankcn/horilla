from django.db import migrations


def add_expenses_feature(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="expenses",
        defaults={
            "label": "Chi phí",
            "group": "use",
            "is_base": True,
            "is_active": True,
            "order": 15,
        },
    )


def reverse_expenses_feature(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="expenses").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0021_appfeature_openapi"),
    ]

    operations = [
        migrations.RunPython(add_expenses_feature, reverse_expenses_feature),
    ]
