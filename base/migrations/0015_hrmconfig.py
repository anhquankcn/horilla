from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0014_appfeature_leave_management"),
    ]

    operations = [
        migrations.CreateModel(
            name="HRMConfig",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.CharField(max_length=100, unique=True)),
                ("value", models.JSONField(blank=True, null=True)),
            ],
            options={"db_table": "base_hrmconfig", "verbose_name": "HRM Config"},
        ),
    ]
