"""tourism/forms.py"""

from django import forms
from django.utils.translation import gettext_lazy as _

from tourism.models import Tour, TourAttendance, TourGuide, TourSchedule


class TourForm(forms.ModelForm):
    class Meta:
        model = Tour
        fields = [
            "name",
            "code",
            "tour_type",
            "destination",
            "departure",
            "duration_days",
            "duration_nights",
            "description",
            "status",
        ]
        widgets = {
            "name": forms.TextInput(attrs={"class": "oh-input w-full", "placeholder": _("Tên tour")}),
            "code": forms.TextInput(attrs={"class": "oh-input w-full", "placeholder": _("VD: HAN-HLG-3N2D")}),
            "tour_type": forms.Select(attrs={"class": "oh-input w-full"}),
            "destination": forms.TextInput(attrs={"class": "oh-input w-full"}),
            "departure": forms.TextInput(attrs={"class": "oh-input w-full"}),
            "duration_days": forms.NumberInput(attrs={"class": "oh-input w-full", "min": 1}),
            "duration_nights": forms.NumberInput(attrs={"class": "oh-input w-full", "min": 0}),
            "description": forms.Textarea(attrs={"class": "oh-input w-full", "rows": 3}),
            "status": forms.Select(attrs={"class": "oh-input w-full"}),
        }


class TourGuideForm(forms.ModelForm):
    class Meta:
        model = TourGuide
        fields = [
            "employee",
            "license_number",
            "license_expiry",
            "guide_type",
            "languages",
            "specialization",
            "is_active",
            "notes",
        ]
        widgets = {
            "employee": forms.Select(attrs={"class": "oh-input w-full"}),
            "license_number": forms.TextInput(attrs={"class": "oh-input w-full"}),
            "license_expiry": forms.DateInput(attrs={"class": "oh-input w-full", "type": "date"}),
            "guide_type": forms.Select(attrs={"class": "oh-input w-full"}),
            "languages": forms.TextInput(attrs={"class": "oh-input w-full"}),
            "specialization": forms.TextInput(attrs={"class": "oh-input w-full"}),
            "notes": forms.Textarea(attrs={"class": "oh-input w-full", "rows": 3}),
        }


class TourScheduleForm(forms.ModelForm):
    class Meta:
        model = TourSchedule
        fields = [
            "tour",
            "schedule_code",
            "start_date",
            "end_date",
            "pax",
            "lead_guide",
            "support_guides",
            "status",
            "notes",
        ]
        widgets = {
            "tour": forms.Select(attrs={"class": "oh-input w-full"}),
            "schedule_code": forms.TextInput(attrs={"class": "oh-input w-full"}),
            "start_date": forms.DateInput(attrs={"class": "oh-input w-full", "type": "date"}),
            "end_date": forms.DateInput(attrs={"class": "oh-input w-full", "type": "date"}),
            "pax": forms.NumberInput(attrs={"class": "oh-input w-full", "min": 0}),
            "lead_guide": forms.Select(attrs={"class": "oh-input w-full"}),
            "support_guides": forms.SelectMultiple(attrs={"class": "oh-input w-full"}),
            "status": forms.Select(attrs={"class": "oh-input w-full"}),
            "notes": forms.Textarea(attrs={"class": "oh-input w-full", "rows": 3}),
        }


class TourAttendanceForm(forms.ModelForm):
    class Meta:
        model = TourAttendance
        fields = [
            "tour_schedule",
            "employee",
            "work_date",
            "check_in",
            "check_out",
            "status",
            "overtime_hours",
            "notes",
        ]
        widgets = {
            "tour_schedule": forms.Select(attrs={"class": "oh-input w-full"}),
            "employee": forms.Select(attrs={"class": "oh-input w-full"}),
            "work_date": forms.DateInput(attrs={"class": "oh-input w-full", "type": "date"}),
            "check_in": forms.TimeInput(attrs={"class": "oh-input w-full", "type": "time"}),
            "check_out": forms.TimeInput(attrs={"class": "oh-input w-full", "type": "time"}),
            "status": forms.Select(attrs={"class": "oh-input w-full"}),
            "overtime_hours": forms.NumberInput(attrs={"class": "oh-input w-full", "step": "0.5", "min": 0}),
            "notes": forms.Textarea(attrs={"class": "oh-input w-full", "rows": 2}),
        }
