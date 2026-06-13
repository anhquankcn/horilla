from django.contrib import admin
from .models import WCMatch, WCPlayer, WCPrediction


@admin.register(WCMatch)
class WCMatchAdmin(admin.ModelAdmin):
    list_display = ("match_number", "team_a", "team_b", "round", "match_time", "status", "score_a", "score_b", "points_pool")
    list_filter = ("round", "status")
    search_fields = ("team_a", "team_b")


@admin.register(WCPlayer)
class WCPlayerAdmin(admin.ModelAdmin):
    list_display = ("nickname", "user", "total_points", "rank")
    search_fields = ("nickname", "user__username")


@admin.register(WCPrediction)
class WCPredictionAdmin(admin.ModelAdmin):
    list_display = ("player", "match", "prediction", "is_correct", "points_earned")
    list_filter = ("is_correct", "prediction")
