from django.db import migrations


def add_expenses_admin_feature(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="expenses-admin",
        defaults={
            "label": "Chi phí HC",
            "group": "manage",
            "is_base": False,
            "is_active": True,
            "order": 16,
        },
    )

    Group = apps.get_model("auth", "Group")
    GroupAppVisibility = apps.get_model("base", "GroupAppVisibility")

    for group_name in ["Hành chính - Lễ tân", "Admin Hệ thống"]:
        try:
            group = Group.objects.get(name=group_name)
        except Group.DoesNotExist:
            continue
        vis, _ = GroupAppVisibility.objects.get_or_create(
            group=group,
            defaults={"allowed_apps": [], "nav_tabs": []},
        )
        if "expenses-admin" not in vis.allowed_apps:
            vis.allowed_apps = list(vis.allowed_apps) + ["expenses-admin"]
            vis.save(update_fields=["allowed_apps"])


def reverse_expenses_admin_feature(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="expenses-admin").delete()

    Group = apps.get_model("auth", "Group")
    GroupAppVisibility = apps.get_model("base", "GroupAppVisibility")
    for group_name in ["Hành chính - Lễ tân", "Admin Hệ thống"]:
        try:
            group = Group.objects.get(name=group_name)
            vis = GroupAppVisibility.objects.get(group=group)
            vis.allowed_apps = [s for s in vis.allowed_apps if s != "expenses-admin"]
            vis.save(update_fields=["allowed_apps"])
        except Exception:
            pass


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0022_appfeature_expenses"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunPython(add_expenses_admin_feature, reverse_expenses_admin_feature),
    ]
