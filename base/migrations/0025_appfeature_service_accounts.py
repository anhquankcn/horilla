from django.db import migrations


def add_service_accounts_feature(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="service-accounts",
        defaults={
            "label": "Service Account",
            "group": "manage",
            "is_base": False,
            "is_active": True,
            "order": 98,
        },
    )

    Group = apps.get_model("auth", "Group")
    GroupAppVisibility = apps.get_model("base", "GroupAppVisibility")

    try:
        group = Group.objects.get(name="Admin Hệ thống")
    except Group.DoesNotExist:
        return

    vis, _ = GroupAppVisibility.objects.get_or_create(
        group=group,
        defaults={"allowed_apps": [], "nav_tabs": []},
    )
    if "service-accounts" not in vis.allowed_apps:
        vis.allowed_apps = list(vis.allowed_apps) + ["service-accounts"]
        vis.save(update_fields=["allowed_apps"])


def reverse(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="service-accounts").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0024_m2m_service_account"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunPython(add_service_accounts_feature, reverse),
    ]
