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

    # Tự động gắn slug vào GroupAppVisibility của nhóm "Admin Hệ thống"
    Group = apps.get_model("auth", "Group")
    GroupAppVisibility = apps.get_model("base", "GroupAppVisibility")

    try:
        group = Group.objects.get(name="Admin Hệ thống")
    except Group.DoesNotExist:
        return  # nhóm chưa tồn tại, bỏ qua

    vis, _ = GroupAppVisibility.objects.get_or_create(
        group=group,
        defaults={"allowed_apps": [], "nav_tabs": []},
    )
    if "open-api" not in vis.allowed_apps:
        vis.allowed_apps = list(vis.allowed_apps) + ["open-api"]
        vis.save(update_fields=["allowed_apps"])


def reverse_openapi_feature(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="open-api").delete()

    Group = apps.get_model("auth", "Group")
    GroupAppVisibility = apps.get_model("base", "GroupAppVisibility")
    try:
        group = Group.objects.get(name="Admin Hệ thống")
        vis = GroupAppVisibility.objects.get(group=group)
        vis.allowed_apps = [s for s in vis.allowed_apps if s != "open-api"]
        vis.save(update_fields=["allowed_apps"])
    except Exception:
        pass


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0020_appfeature_new_features"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunPython(add_openapi_feature, reverse_openapi_feature),
    ]
