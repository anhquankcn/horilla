from django.db import migrations, models


INITIAL_FEATURES = [
    # slug, label, group, is_base, order
    # ── Sử dụng (self-service) ──────────────────────────────────────────────
    ("attendance",         "Chấm công",        "use", True,  10),
    ("work-schedule",      "Lịch làm việc",    "use", True,  20),
    ("monthly-attendance", "Tính Công Tháng",  "use", True,  30),
    ("leave",              "Nghỉ phép",        "use", True,  40),
    ("proposals",          "Đề xuất",          "use", True,  50),
    ("approvals",          "Phê duyệt",        "use", False, 60),
    ("payslip",            "Phiếu lương",      "use", True,  70),
    ("notifications",      "Thông báo",        "use", True,  80),
    ("helpdesk",           "Hỗ trợ IT",        "use", True,  90),
    ("documents",          "Tài liệu",         "use", True, 100),
    ("unified-calendar",   "Lịch tổng hợp",    "use", False, 110),
    ("tasks",              "Công việc",        "use", False, 120),
    ("projects",           "Dự án",            "use", False, 130),
    # ── Quản lý ─────────────────────────────────────────────────────────────
    ("employees",          "Nhân sự",          "manage", False, 200),
    ("roles",              "Vai trò & Quyền",  "manage", False, 210),
    ("groups",             "Nhóm Quyền",       "manage", False, 220),
    ("attendance-activity","HĐ Chấm công",     "manage", False, 230),
    ("announcement-hub",   "Hub Thông Báo",    "manage", False, 240),
    ("dashboard",          "Dashboard",        "manage", False, 250),
    ("monthly-att",        "CC Tháng",         "manage", False, 260),
    ("assets",             "Tài sản",          "manage", False, 270),
    ("reports",            "Báo cáo",          "manage", False, 280),
    ("payroll-mgmt",       "Bảng lương",       "manage", False, 290),
    ("onboarding",         "On/Offboarding",   "manage", False, 300),
    ("journey",            "Hành trình NV",    "manage", False, 310),
    ("pms",                "Hiệu suất",        "manage", False, 320),
    ("training",           "Đào tạo",          "manage", False, 330),
    ("org-chart",          "Cây tổ chức",      "manage", False, 340),
    ("promotion-hub",      "Hub Thăng Tiến",   "manage", False, 350),
]


def insert_features(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    for slug, label, group, is_base, order in INITIAL_FEATURES:
        AppFeature.objects.get_or_create(
            slug=slug,
            defaults=dict(label=label, group=group, is_base=is_base, order=order, is_active=True),
        )


def remove_features(apps, schema_editor):
    AppFeature = apps.get_model("base", "AppFeature")
    AppFeature.objects.filter(slug__in=[r[0] for r in INITIAL_FEATURES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0010_groupappvisibility_nav_tabs"),
    ]

    operations = [
        migrations.CreateModel(
            name="AppFeature",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("slug",     models.CharField(max_length=60, unique=True, verbose_name="Slug")),
                ("label",    models.CharField(max_length=100, verbose_name="Tên hiển thị")),
                ("group",    models.CharField(
                    choices=[("use", "Sử dụng"), ("manage", "Quản lý")],
                    default="use", max_length=20, verbose_name="Nhóm",
                )),
                ("is_base",  models.BooleanField(default=False, verbose_name="Luôn hiển thị")),
                ("is_active",models.BooleanField(default=True,  verbose_name="Kích hoạt")),
                ("order",    models.PositiveSmallIntegerField(default=0, verbose_name="Thứ tự")),
            ],
            options={
                "verbose_name": "App Feature",
                "verbose_name_plural": "App Features",
                "db_table": "base_appfeature",
                "ordering": ["order", "slug"],
            },
        ),
        migrations.RunPython(insert_features, remove_features),
    ]
