from django.db import migrations


NEW_FEATURES = [
    # slug, label, group, is_base, order
    ("shift-planner",  "Phân Ca NV",  "manage", False, 268),
    ("announcements",  "Tin nội bộ",  "use",    True,  85),
]


def add_features(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    for slug, label, group, is_base, order in NEW_FEATURES:
        AppFeature.objects.get_or_create(
            slug=slug,
            defaults=dict(label=label, group=group, is_base=is_base, order=order, is_active=True),
        )


def remove_features(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug__in=[r[0] for r in NEW_FEATURES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0019_add_target_departments"),
    ]

    operations = [
        migrations.RunPython(add_features, remove_features),
    ]
