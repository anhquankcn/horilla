from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("employee", "0006_hnhemployeeprofile"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="hnhemployeeprofile",
            name="last_password_reset_sent_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Lần gửi đặt lại mật khẩu gần nhất"),
        ),
        migrations.AddField(
            model_name="hnhemployeeprofile",
            name="last_password_reset_sent_by",
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Người gửi đặt lại mật khẩu",
            ),
        ),
    ]
