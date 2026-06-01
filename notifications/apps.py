""" Django notifications apps file """

# -*- coding: utf-8 -*-
from django.apps import AppConfig


class Config(AppConfig):
    name = "notifications"
    default_auto_field = "django.db.models.AutoField"

    def ready(self):
        super(Config, self).ready()
        # this is for backwards compability
        import notifications.signals

        notifications.notify = notifications.signals.notify

        from notifications.push import on_notification_created

        notifications.signals.notify.connect(
            on_notification_created,
            dispatch_uid="notifications.push.on_notification_created",
        )
