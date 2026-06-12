from django.db import migrations


def add_feature(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="job-mgmt",
        defaults={
            "label": "Vị trí & Vai trò",
            "group": "manage",
            "is_base": False,
            "is_active": True,
            "order": 86,
        },
    )

    Group = apps.get_model("auth", "Group")
    GroupAppVisibility = apps.get_model("base", "GroupAppVisibility")
    for name in ["Admin Hệ thống", "Chuyên viên C&B"]:
        try:
            g = Group.objects.get(name=name)
            vis, _ = GroupAppVisibility.objects.get_or_create(
                group=g, defaults={"allowed_apps": [], "nav_tabs": []}
            )
            if "job-mgmt" not in vis.allowed_apps:
                vis.allowed_apps = list(vis.allowed_apps) + ["job-mgmt"]
                vis.save(update_fields=["allowed_apps"])
        except Group.DoesNotExist:
            pass


def reverse(apps, schema_editor):
    apps.get_model("base", "AppFeature").objects.filter(slug="job-mgmt").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0030_appfeature_account_mgmt"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]
    operations = [
        migrations.RunPython(add_feature, reverse),
    ]
