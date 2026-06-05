from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("base", "0009_company_lat_lng"),
    ]

    operations = [
        migrations.AddField(
            model_name="groupappvisibility",
            name="nav_tabs",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Empty = all tabs visible. List tab IDs to restrict: home, attend, apps, ruby, tasks, me",
                verbose_name="Allowed Nav Tabs",
            ),
        ),
    ]
