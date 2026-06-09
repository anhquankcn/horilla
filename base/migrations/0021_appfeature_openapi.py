from django.db import migrations


def add_openapi_feature(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="open-api",
        defaults={
            "label": "Open API",
            "group": "manage",
            "is_base": False,
            "is_active": True,
            "order": 99,
        },
    )


def reverse_openapi_feature(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="open-api").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0020_appfeature_new_features"),
    ]

    operations = [
        migrations.RunPython(add_openapi_feature, reverse_openapi_feature),
    ]
