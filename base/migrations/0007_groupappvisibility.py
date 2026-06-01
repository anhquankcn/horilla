from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
        ("base", "0006_kc_user_mapping"),
    ]

    operations = [
        migrations.CreateModel(
            name="GroupAppVisibility",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "allowed_apps",
                    models.JSONField(
                        blank=True,
                        default=list,
                        verbose_name="Allowed Apps",
                    ),
                ),
                (
                    "group",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="app_visibility",
                        to="auth.group",
                        verbose_name="Group",
                    ),
                ),
            ],
            options={
                "verbose_name": "Group App Visibility",
                "verbose_name_plural": "Group App Visibilities",
                "db_table": "base_groupappvisibility",
            },
        ),
    ]
