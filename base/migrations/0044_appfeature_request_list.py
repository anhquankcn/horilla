from django.db import migrations


def add_request_list(apps, schema_editor):
    # Bật extension unaccent để tìm Họ tên KHÔNG dấu ở Quản lý DS Đơn.
    try:
        schema_editor.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    except Exception:
        pass
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.get_or_create(
        slug="request-list",
        defaults=dict(
            label="Quản lý DS Đơn",
            group="manage",
            is_base=False,
            order=275,
            is_active=True,
        ),
    )


def remove_request_list(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug="request-list").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0043_appfeature_team_monitor"),
    ]

    operations = [
        migrations.RunPython(add_request_list, remove_request_list),
    ]
