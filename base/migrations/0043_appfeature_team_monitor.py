from django.db import migrations


def add_team_monitor(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="team-monitor",
        defaults=dict(
            label="Theo dõi Team",
            group="manage",
            is_base=False,
            order=270,
            is_active=True,
        ),
    )


def remove_team_monitor(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="team-monitor").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0042_appfeature_sync_registry"),
    ]

    operations = [
        migrations.RunPython(add_team_monitor, remove_team_monitor),
    ]
