from django.conf import settings
from django.db import models

ROUND_CHOICES = [
    ("group", "Vòng bảng"),
    ("round32", "Vòng 1/32"),
    ("round16", "Vòng 1/16"),
    ("quarter", "Tứ kết"),
    ("semi", "Bán kết"),
    ("final", "Chung kết"),
]

ROUND_POINTS = {
    "group": 1000,
    "round32": 1500,
    "round16": 2000,
    "quarter": 3000,
    "semi": 4000,
    "final": 5000,
}

STATUS_CHOICES = [
    ("upcoming", "Sắp diễn ra"),
    ("live", "Đang diễn ra"),
    ("finished", "Kết thúc"),
]

PREDICTION_CHOICES = [
    ("win_a", "Đội A thắng"),
    ("draw", "Hòa"),
    ("win_b", "Đội B thắng"),
]


class WCMatch(models.Model):
    match_number = models.PositiveSmallIntegerField(unique=True)
    team_a = models.CharField(max_length=40)
    team_b = models.CharField(max_length=40)
    team_a_code = models.CharField(max_length=3)
    team_b_code = models.CharField(max_length=3)
    round = models.CharField(max_length=10, choices=ROUND_CHOICES)
    group_name = models.CharField(max_length=2, blank=True, default="")
    match_time = models.DateTimeField()
    score_a = models.PositiveSmallIntegerField(null=True, blank=True)
    score_b = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="upcoming")
    points_pool = models.PositiveIntegerField(default=1000)

    class Meta:
        ordering = ["match_time", "match_number"]
        verbose_name = "WC Match"

    def __str__(self):
        return f"#{self.match_number} {self.team_a} vs {self.team_b}"

    def save(self, *args, **kwargs):
        if not self.points_pool or self.points_pool == 1000:
            self.points_pool = ROUND_POINTS.get(self.round, 1000)
        super().save(*args, **kwargs)


class WCPlayer(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wc_player"
    )
    nickname = models.CharField(max_length=30, unique=True)
    total_points = models.IntegerField(default=0)
    rank = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-total_points", "nickname"]

    def __str__(self):
        return f"{self.nickname} ({self.total_points}pts)"


class WCPrediction(models.Model):
    player = models.ForeignKey(
        WCPlayer, on_delete=models.CASCADE, related_name="predictions"
    )
    match = models.ForeignKey(
        WCMatch, on_delete=models.CASCADE, related_name="predictions"
    )
    prediction = models.CharField(max_length=5, choices=PREDICTION_CHOICES)
    points_earned = models.IntegerField(default=0)
    is_correct = models.BooleanField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("player", "match")]
        ordering = ["-match__match_time"]

    def __str__(self):
        return f"{self.player.nickname} → {self.match} = {self.prediction}"
