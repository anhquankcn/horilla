from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0005_announcement_pinned_announcementlike"),
    ]

    operations = [
        migrations.AddField(
            model_name="announcement",
            name="image",
            field=models.ImageField(
                blank=True, null=True, upload_to="announcements/"
            ),
        ),
    ]
