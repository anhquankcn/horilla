from django.db import migrations


def add_settings(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="settings",
        defaults=dict(
            label="Cài đặt",
            group="manage",
            is_base=True,
            order=999,
            is_active=True,
        ),
    )


def remove_settings(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="settings").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0015_hrmconfig"),
    ]

    operations = [
        migrations.RunPython(add_settings, remove_settings),
    ]
