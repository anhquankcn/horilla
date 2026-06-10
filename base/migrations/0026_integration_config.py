from django.db import migrations, models


def seed_systems(apps, schema_editor):
    IC = apps.get_model("base", "IntegrationConfig")
    systems = [
        ("arkon", "Arkon AI"),
        ("eoffice", "eOffice"),
        ("1stopshop", "1StopShop"),
        ("iam", "IAM (Identity)"),
        ("appvmb", "AppVMB"),
    ]
    for slug, label in systems:
        IC.objects.get_or_create(system=slug, defaults={"label": label})


class Migration(migrations.Migration):
    dependencies = [
        ("base", "0025_appfeature_service_accounts"),
    ]

    operations = [
        migrations.CreateModel(
            name="IntegrationConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("system", models.CharField(choices=[("arkon", "Arkon AI"), ("eoffice", "eOffice"), ("1stopshop", "1StopShop"), ("iam", "IAM (Identity)"), ("appvmb", "AppVMB")], max_length=30, unique=True, verbose_name="Hệ thống")),
                ("label", models.CharField(blank=True, max_length=100, verbose_name="Tên hiển thị")),
                ("token", models.TextField(blank=True, verbose_name="Service Token")),
                ("scopes", models.JSONField(blank=True, default=list, help_text='JSON list, vd ["embed:login","wiki:read"]', verbose_name="Scopes / Quyền")),
                ("base_url", models.URLField(blank=True, verbose_name="Base URL")),
                ("enabled", models.BooleanField(default=False, verbose_name="Kích hoạt")),
                ("notes", models.TextField(blank=True, verbose_name="Ghi chú")),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Integration Config",
                "verbose_name_plural": "Integration Configs",
                "db_table": "base_integration_config",
                "ordering": ["system"],
            },
        ),
        migrations.RunPython(seed_systems, migrations.RunPython.noop),
    ]
