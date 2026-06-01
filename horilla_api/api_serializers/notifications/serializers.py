from rest_framework import serializers

from notifications.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id", "level", "unread", "verb", "description",
            "timestamp", "deleted", "data", "actor_name",
        ]

    def get_actor_name(self, obj):
        if obj.actor:
            return str(obj.actor)
        return None
