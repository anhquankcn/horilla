import json
import logging

from django.conf import settings
from pywebpush import webpush, WebPushException

from .models import PushSubscription

logger = logging.getLogger(__name__)


def send_web_push(user, title, body, url=None):
    subscriptions = PushSubscription.objects.filter(user=user)
    if not subscriptions.exists():
        return

    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url or "/notifications",
    })

    vapid_claims = {
        "sub": f"mailto:{settings.VAPID_ADMIN_EMAIL}",
    }
    stale_ids = []

    for sub in subscriptions:
        sub_info = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
        }
        try:
            webpush(
                subscription_info=sub_info,
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims=vapid_claims,
            )
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                stale_ids.append(sub.id)
            else:
                logger.warning("Web push failed for user %s: %s", user, e)
        except Exception as e:
            logger.warning("Web push error for user %s: %s", user, e)

    if stale_ids:
        PushSubscription.objects.filter(id__in=stale_ids).delete()


def on_notification_created(sender, **kwargs):
    from django.contrib.auth.models import Group
    from django.db.models.query import QuerySet

    recipient = kwargs.get("recipient")
    verb = str(kwargs.get("verb", ""))
    description = kwargs.get("description", "")

    actor_name = str(sender) if sender else "HNH HRM"
    body = description or verb

    if isinstance(recipient, Group):
        users = list(recipient.user_set.all())
    elif isinstance(recipient, (QuerySet, list)):
        users = list(recipient)
    else:
        users = [recipient]

    for user in users:
        send_web_push(user, title=actor_name, body=body)
