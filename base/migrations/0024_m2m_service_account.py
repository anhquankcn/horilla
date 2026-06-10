from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0023_appfeature_expenses_admin"),
    ]

    operations = [
        migrations.CreateModel(
            name="M2MServiceAccount",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100, verbose_name="Tên hệ thống")),
                ("slug", models.SlugField(max_length=60, unique=True, verbose_name="Slug")),
                ("description", models.TextField(blank=True, verbose_name="Mô tả")),
                ("token_hash", models.CharField(db_index=True, max_length=64, unique=True)),
                ("token_prefix", models.CharField(blank=True, max_length=16)),
                ("scopes", models.JSONField(blank=True, default=list, help_text='JSON list, vd ["employee:read","attendance:read"]. "*" = full.', verbose_name="Scopes")),
                ("allowed_cidrs", models.JSONField(blank=True, default=list, help_text="Trống = dùng global trusted CIDRs. Mỗi item là CIDR, vd 100.64.0.0/10", verbose_name="Allowed CIDRs")),
                ("status", models.CharField(choices=[("active", "Active"), ("revoked", "Revoked")], default="active", max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_rotated_at", models.DateTimeField(blank=True, null=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                ("last_used_ip", models.GenericIPAddressField(blank=True, null=True)),
            ],
            options={
                "verbose_name": "M2M Service Account",
                "verbose_name_plural": "M2M Service Accounts",
                "db_table": "base_m2m_service_account",
                "ordering": ["-created_at"],
            },
        ),
    ]
