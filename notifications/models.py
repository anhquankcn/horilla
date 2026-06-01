from django.conf import settings
from django.db import models
from swapper import swappable_setting

from .base.models import AbstractNotification, notify_handler  # noqa


class Notification(AbstractNotification):
    verb_en = models.CharField(max_length=255, default="", null=True)
    verb_ar = models.CharField(max_length=255, default="", null=True)
    verb_de = models.CharField(max_length=255, default="", null=True)
    verb_es = models.CharField(max_length=255, default="", null=True)
    verb_fr = models.CharField(max_length=255, default="", null=True)

    class Meta(AbstractNotification.Meta):
        abstract = False
        swappable = swappable_setting("notifications", "Notification")


class PushSubscription(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=1024, unique=True)
    p256dh = models.CharField(max_length=256)
    auth = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications_pushsubscription"

    def __str__(self):
        return f"PushSub({self.user}) {self.endpoint[:60]}..."
