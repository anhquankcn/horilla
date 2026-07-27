from django.db import migrations


# Feature còn thiếu trong registry (Apps.tsx có nhưng AppFeature chưa) — để picker
# Nhóm quyền hiển thị đủ, phân quyền đúng. (slug, label, group, is_base, order)
ADD_FEATURES = [
    ("eoffice",       "eOffice",         "use", False, 200),
    ("calendar",      "Lịch",            "use", True,  90),
    ("calendar-sync", "Đồng bộ lịch",    "use", True,  92),
    ("outlook",       "Kết nối Outlook", "use", True,  94),
]

# Sửa label đang hiện raw-slug → label đúng (khớp Apps.tsx).
FIX_LABELS = {
    "leave-import":       "Import Phép Năm",
    "attendance-manager": "Quản lý Công NV",
}


def sync(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    # Xóa entry slug rỗng (rác)
    AppFeature.objects.filter(slug="").delete()
    # Thêm feature thiếu — tạo mới HOẶC kích hoạt lại nếu đang inactive.
    for slug, label, group, is_base, order in ADD_FEATURES:
        obj, created = AppFeature.objects.get_or_create(
            slug=slug,
            defaults=dict(label=label, group=group, is_base=is_base, order=order, is_active=True),
        )
        if not created and not obj.is_active:
            obj.is_active = True
            obj.label = obj.label or label
            obj.save(update_fields=["is_active", "label"])
    # Sửa label raw-slug
    for slug, label in FIX_LABELS.items():
        AppFeature.objects.filter(slug=slug).update(label=label)


def unsync(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug__in=[r[0] for r in ADD_FEATURES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0041_appfeature_hr_master"),
    ]

    operations = [
        migrations.RunPython(sync, unsync),
    ]
