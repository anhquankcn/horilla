from rest_framework import serializers

from tourism.models import Tour, TourGuide, TourSchedule


class TourSerializer(serializers.ModelSerializer):
    duration_display = serializers.CharField(read_only=True)

    class Meta:
        model = Tour
        fields = [
            "id",
            "name",
            "code",
            "tour_type",
            "destination",
            "departure",
            "duration_days",
            "duration_nights",
            "duration_display",
            "status",
        ]


class TourGuideSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = TourGuide
        fields = [
            "id",
            "full_name",
            "license_number",
            "guide_type",
            "languages",
            "specialization",
        ]

    def get_full_name(self, obj):
        return obj.employee.get_full_name()


class TourScheduleSerializer(serializers.ModelSerializer):
    tour = TourSerializer(read_only=True)
    lead_guide = TourGuideSerializer(read_only=True)
    duration_display = serializers.CharField(read_only=True)

    class Meta:
        model = TourSchedule
        fields = [
            "id",
            "schedule_code",
            "tour",
            "start_date",
            "end_date",
            "pax",
            "lead_guide",
            "status",
            "duration_display",
        ]
