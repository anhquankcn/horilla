"""Cuối ngày (23:50): tính lại công cho ca một chiều + nhắc nhân viên nộp đơn
giải trình tới C&B nếu thiếu chấm công (quên clock-in ca clock_in_only hoặc quên
clock-out ca clock_out_only).

Usage:
    python manage.py finalize_oneway_attendance            # hôm nay
    python manage.py finalize_oneway_attendance --date 2026-06-15
"""
import logging
from datetime import date as _date

from django.core.management.base import BaseCommand
from django.urls import reverse
from django.utils import timezone as django_tz

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Tính lại công ca một chiều + nhắc nộp đơn giải trình khi thiếu chấm công"

    def add_arguments(self, parser):
        parser.add_argument("--date", help="YYYY-MM-DD (mặc định hôm nay)")

    def handle(self, *args, **options):
        from attendance.models import EmployeeShiftPlan
        from attendance.views.clock_in_out import recompute_combined_day
        from base.models import EmployeeShiftDay, EmployeeShiftSchedule
        from employee.models import Employee
        from notifications.signals import notify

        if options.get("date"):
            y, m, d = map(int, options["date"].split("-"))
            the_date = _date(y, m, d)
        else:
            the_date = django_tz.localtime(django_tz.now()).date()

        weekday = the_date.strftime("%A").lower()
        try:
            day_obj = EmployeeShiftDay.objects.get(day=weekday)
        except EmployeeShiftDay.DoesNotExist:
            self.stdout.write("No shift day; skip.")
            return

        oneway_shift_ids = list(
            EmployeeShiftSchedule.objects.filter(
                day=day_obj, check_mode__in=["clock_in_only", "clock_out_only"]
            ).values_list("shift_id", flat=True)
        )
        if not oneway_shift_ids:
            self.stdout.write("No one-way shift today; skip.")
            return

        emp_ids = list(
            EmployeeShiftPlan.objects.filter(
                shift_id__in=oneway_shift_ids, date=the_date
            ).values_list("employee_id", flat=True).distinct()
        )

        try:
            redirect = reverse("view-my-attendance")
        except Exception:
            redirect = "/"

        notified = 0
        for emp in Employee.objects.filter(id__in=emp_ids, is_active=True):
            try:
                res = recompute_combined_day(emp, the_date)
            except Exception:
                logger.exception("recompute failed for %s", emp)
                continue

            # KHÔNG đóng activity còn mở: để mở = NCO (No Clock Out). NV nộp đơn
            # khai báo ngày công cho C&B duyệt; CC Tháng hiển thị NCO; clock-in
            # ngày mới vẫn bình thường (_is_clocked_in chỉ tính ca mở trong ~18h).
            if not (res and res.get("missing")):
                continue
            needs = ", ".join(
                (f"chấm VÀO ca {m['shift']}" if m["need"] == "clock_in"
                 else f"chấm RA ca {m['shift']}")
                for m in res["missing"]
            )
            user = getattr(emp, "employee_user_id", None)
            if not user:
                continue
            notify.send(
                emp,
                recipient=user,
                verb=f"Bạn thiếu {needs} ngày {the_date}. Vui lòng nộp đơn giải trình tới C&B.",
                redirect=redirect,
                icon="alert-circle",
            )
            notified += 1

        self.stdout.write(f"finalize_oneway_attendance {the_date}: notified {notified}")
