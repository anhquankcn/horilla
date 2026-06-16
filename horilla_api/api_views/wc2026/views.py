from django.db import transaction
from django.db.models import Count, Q, Sum, Window, F
from django.db.models.functions import RowNumber
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from wc2026.models import WCMatch, WCPlayer, WCPrediction, ROUND_POINTS


class WCRegisterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if WCPlayer.objects.filter(user=request.user).exists():
            p = WCPlayer.objects.get(user=request.user)
            return Response({"error": "Bạn đã đăng ký", "nickname": p.nickname}, status=400)

        nickname = (request.data.get("nickname") or "").strip()
        if not nickname or len(nickname) < 2 or len(nickname) > 30:
            return Response({"error": "Nickname phải từ 2-30 ký tự"}, status=400)

        if WCPlayer.objects.filter(nickname__iexact=nickname).exists():
            return Response({"error": "Nickname đã tồn tại"}, status=400)

        player = WCPlayer.objects.create(user=request.user, nickname=nickname)
        return Response({
            "id": player.id, "nickname": player.nickname,
            "total_points": 0, "rank": 0,
        }, status=201)


class WCMatchListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = WCMatch.objects.all()

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        round_filter = request.query_params.get("round")
        if round_filter:
            qs = qs.filter(round=round_filter)

        player = WCPlayer.objects.filter(user=request.user).first()
        my_preds = {}
        if player:
            for p in WCPrediction.objects.filter(player=player, match__in=qs):
                my_preds[p.match_id] = p.prediction

        now = timezone.now()
        results = []
        for m in qs:
            pred_count = m.predictions.count()
            results.append({
                "id": m.id,
                "match_number": m.match_number,
                "team_a": m.team_a,
                "team_b": m.team_b,
                "team_a_code": m.team_a_code,
                "team_b_code": m.team_b_code,
                "round": m.round,
                "round_display": m.get_round_display(),
                "group_name": m.group_name,
                "match_time": m.match_time.isoformat(),
                "score_a": m.score_a,
                "score_b": m.score_b,
                "status": m.status,
                "points_pool": m.points_pool,
                "my_prediction": my_preds.get(m.id),
                "prediction_count": pred_count,
                "can_predict": m.status == "upcoming" and m.match_time > now,
            })
        return Response({"results": results})


class WCPredictView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        player = WCPlayer.objects.filter(user=request.user).first()
        if not player:
            return Response({"error": "Bạn chưa đăng ký chơi"}, status=400)

        match_id = request.data.get("match_id")
        prediction = request.data.get("prediction")

        if prediction not in ("win_a", "draw", "win_b"):
            return Response({"error": "Dự đoán không hợp lệ"}, status=400)

        try:
            match = WCMatch.objects.get(pk=match_id)
        except WCMatch.DoesNotExist:
            return Response({"error": "Trận đấu không tồn tại"}, status=404)

        if match.status != "upcoming" or match.match_time <= timezone.now():
            return Response({"error": "Trận đấu đã bắt đầu, không thể dự đoán"}, status=400)

        obj, created = WCPrediction.objects.update_or_create(
            player=player, match=match,
            defaults={"prediction": prediction},
        )
        return Response({
            "match_id": match.id,
            "prediction": prediction,
            "updated": not created,
        })


class WCLeaderboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        players = list(
            WCPlayer.objects.annotate(
                correct_count=Count("predictions", filter=Q(predictions__is_correct=True)),
                total_predictions=Count("predictions", filter=Q(predictions__is_correct__isnull=False)),
            ).order_by("-total_points", "nickname")
        )

        total = len(players)
        mid_idx = total // 2 if total > 0 else -1
        penultimate_idx = total - 2 if total >= 2 else -1

        my_player = WCPlayer.objects.filter(user=request.user).first()
        my_rank = None

        results = []
        for i, p in enumerate(players):
            rank = i + 1
            is_me = my_player and p.id == my_player.id
            if is_me:
                my_rank = rank

            highlight = None
            if rank <= 5:
                highlight = "top5"
            elif i == mid_idx and total > 10:
                highlight = "middle"
            elif i == penultimate_idx and total > 5:
                highlight = "penultimate"

            results.append({
                "rank": rank,
                "nickname": p.nickname,
                "total_points": p.total_points,
                "correct_count": p.correct_count,
                "total_predictions": p.total_predictions,
                "is_me": is_me,
                "highlight": highlight,
            })

        return Response({
            "results": results,
            "total_players": total,
            "my_rank": my_rank,
        })


class WCMyProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        is_admin = bool(request.user.is_staff or request.user.is_superuser)
        player = WCPlayer.objects.filter(user=request.user).first()
        if not player:
            return Response({"registered": False, "is_admin": is_admin})

        preds = WCPrediction.objects.filter(player=player).select_related("match").order_by("-match__match_time")
        correct = preds.filter(is_correct=True).count()
        total = preds.filter(is_correct__isnull=False).count()

        pred_list = []
        for p in preds[:50]:
            m = p.match
            pred_list.append({
                "match_number": m.match_number,
                "team_a": m.team_a,
                "team_b": m.team_b,
                "team_a_code": m.team_a_code,
                "team_b_code": m.team_b_code,
                "prediction": p.prediction,
                "prediction_display": p.get_prediction_display(),
                "is_correct": p.is_correct,
                "points_earned": p.points_earned,
                "match_status": m.status,
                "match_time": m.match_time.isoformat(),
                "score_a": m.score_a,
                "score_b": m.score_b,
            })

        return Response({
            "registered": True,
            "is_admin": is_admin,
            "player": {
                "nickname": player.nickname,
                "total_points": player.total_points,
                "rank": player.rank,
                "correct_count": correct,
                "total_predictions": total,
            },
            "predictions": pred_list,
        })


class WCAdminResultView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response({"error": "Không có quyền"}, status=403)

        match_id = request.data.get("match_id")
        score_a = request.data.get("score_a")
        score_b = request.data.get("score_b")

        if score_a is None or score_b is None:
            return Response({"error": "Thiếu tỷ số"}, status=400)

        try:
            match = WCMatch.objects.get(pk=match_id)
        except WCMatch.DoesNotExist:
            return Response({"error": "Trận đấu không tồn tại"}, status=404)

        score_a = int(score_a)
        score_b = int(score_b)

        if score_a > score_b:
            result = "win_a"
        elif score_a == score_b:
            result = "draw"
        else:
            result = "win_b"

        with transaction.atomic():
            match.score_a = score_a
            match.score_b = score_b
            match.status = "finished"
            match.save()

            all_preds = WCPrediction.objects.filter(match=match)
            correct_preds = all_preds.filter(prediction=result)
            incorrect_preds = all_preds.exclude(prediction=result)

            correct_count = correct_preds.count()
            total_preds = all_preds.count()

            points_each = match.points_pool // correct_count if correct_count > 0 else 0

            correct_preds.update(is_correct=True, points_earned=points_each)
            incorrect_preds.update(is_correct=False, points_earned=0)

            for player in WCPlayer.objects.all():
                player.total_points = (
                    WCPrediction.objects.filter(player=player, is_correct=True)
                    .aggregate(total=Sum("points_earned"))["total"] or 0
                )
                player.save(update_fields=["total_points"])

            ranked = WCPlayer.objects.order_by("-total_points", "nickname")
            for i, p in enumerate(ranked):
                p.rank = i + 1
                p.save(update_fields=["rank"])

        return Response({
            "match_id": match.id,
            "result": result,
            "score": f"{score_a}-{score_b}",
            "correct_count": correct_count,
            "points_per_correct": points_each,
            "total_predictions": total_preds,
        })
