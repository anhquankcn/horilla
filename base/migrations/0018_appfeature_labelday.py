from django.db import migrations


def add_feature(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="hrm-wds-labelday",
        defaults=dict(
            label="Gán lịch bận",
            group="manage",
            is_base=False,
            order=90,
            is_active=True,
        ),
    )


def remove_feature(apps, schema_editor):
    apps.get_model("base", "AppFeature").objects.filter(slug="hrm-wds-labelday").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0017_appfeature_att_setting"),
    ]

    operations = [
        migrations.RunPython(add_feature, remove_feature),
    ]
