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


class Announcement(models.Model):
    TARGET_INDIVIDUAL = "individual"
    TARGET_MULTI = "multi_user"
    TARGET_DEPARTMENT = "department"
    TARGET_COMPANY = "company"
    TARGET_CHOICES = [
        (TARGET_INDIVIDUAL, "Cá nhân"),
        (TARGET_MULTI, "Nhiều người"),
        (TARGET_DEPARTMENT, "Phòng ban"),
        (TARGET_COMPANY, "Toàn công ty"),
    ]

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_announcements",
    )
    title = models.CharField(max_length=255)
    body = models.TextField()
    target_type = models.CharField(max_length=20, choices=TARGET_CHOICES)
    target_department = models.ForeignKey(
        "base.Department",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="notification_announcements",
    )
    target_company = models.ForeignKey(
        "base.Company",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="notification_announcements",
    )
    send_as_system = models.BooleanField(default=False)
    pinned = models.BooleanField(default=False, verbose_name="Ghim")
    image = models.ImageField(upload_to="announcements/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications_announcement"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.get_target_type_display()})"


class AnnouncementRecipient(models.Model):
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name="recipients",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_announcements",
    )
    read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications_announcementrecipient"
        unique_together = [("announcement", "user")]

    def __str__(self):
        return f"{self.user} ← {self.announcement.title}"


class AnnouncementLike(models.Model):
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name="likes",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications_announcementlike"
        unique_together = [("announcement", "user")]

    def __str__(self):
        return f"{self.user} ♥ {self.announcement.title}"


class AnnouncementFeedback(models.Model):
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name="feedbacks",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications_announcementfeedback"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Feedback by {self.user} on {self.announcement.title}"


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
