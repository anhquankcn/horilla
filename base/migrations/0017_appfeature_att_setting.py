from django.db import migrations


def update_features(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    # Đổi tên settings → hrm-att-setting (CC management)
    AppFeature.objects.filter(slug="settings").update(
        slug="hrm-att-setting",
        label="Cài đặt CC",
        group="manage",
        is_base=True,
        order=999,
    )
    # Thêm hrm-app-setting (personal settings, use group)
    AppFeature.objects.get_or_create(
        slug="hrm-app-setting",
        defaults=dict(
            label="Cài đặt Ứng dụng",
            group="use",
            is_base=True,
            order=998,
            is_active=True,
        ),
    )


def revert_features(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="hrm-att-setting").update(
        slug="settings",
        label="Cài đặt",
        group="manage",
    )
    AppFeature.objects.filter(slug="hrm-app-setting").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0016_appfeature_settings"),
    ]

    operations = [
        migrations.RunPython(update_features, revert_features),
    ]
