"""tourism/views.py"""

from django.contrib import messages
from django.contrib.auth.decorators import login_required, permission_required
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.translation import gettext_lazy as _

from tourism.forms import TourAttendanceForm, TourForm, TourGuideForm, TourScheduleForm
from tourism.models import Tour, TourAttendance, TourGuide, TourSchedule


# ─── Tour views ──────────────────────────────────────────────────────────────

@login_required
def tour_list(request):
    tours = Tour.objects.all()
    return render(request, "tourism/tour_list.html", {"tours": tours})


@login_required
def tour_create(request):
    form = TourForm(request.POST or None)
    if form.is_valid():
        form.save()
        messages.success(request, _("Tour đã được tạo thành công."))
        return redirect("tourism-tour-list")
    return render(request, "tourism/tour_form.html", {"form": form, "title": _("Thêm tour mới")})


@login_required
def tour_edit(request, pk):
    tour = get_object_or_404(Tour, pk=pk)
    form = TourForm(request.POST or None, instance=tour)
    if form.is_valid():
        form.save()
        messages.success(request, _("Tour đã được cập nhật."))
        return redirect("tourism-tour-list")
    return render(request, "tourism/tour_form.html", {"form": form, "title": _("Chỉnh sửa tour")})


@login_required
def tour_delete(request, pk):
    tour = get_object_or_404(Tour, pk=pk)
    if request.method == "POST":
        tour.delete()
        messages.success(request, _("Tour đã được xóa."))
    return redirect("tourism-tour-list")


# ─── TourGuide views ──────────────────────────────────────────────────────────

@login_required
def guide_list(request):
    guides = TourGuide.objects.select_related("employee").filter(is_active=True)
    return render(request, "tourism/guide_list.html", {"guides": guides})


@login_required
def guide_create(request):
    form = TourGuideForm(request.POST or None)
    if form.is_valid():
        form.save()
        messages.success(request, _("Hướng dẫn viên đã được thêm."))
        return redirect("tourism-guide-list")
    return render(request, "tourism/guide_form.html", {"form": form, "title": _("Thêm hướng dẫn viên")})


@login_required
def guide_edit(request, pk):
    guide = get_object_or_404(TourGuide, pk=pk)
    form = TourGuideForm(request.POST or None, instance=guide)
    if form.is_valid():
        form.save()
        messages.success(request, _("Thông tin HDV đã được cập nhật."))
        return redirect("tourism-guide-list")
    return render(request, "tourism/guide_form.html", {"form": form, "title": _("Chỉnh sửa HDV")})


@login_required
def guide_delete(request, pk):
    guide = get_object_or_404(TourGuide, pk=pk)
    if request.method == "POST":
        guide.delete()
        messages.success(request, _("HDV đã được xóa."))
    return redirect("tourism-guide-list")


# ─── TourSchedule views ───────────────────────────────────────────────────────

@login_required
def schedule_list(request):
    schedules = TourSchedule.objects.select_related("tour", "lead_guide__employee").order_by(
        "-start_date"
    )
    return render(request, "tourism/schedule_list.html", {"schedules": schedules})


@login_required
def schedule_create(request):
    form = TourScheduleForm(request.POST or None)
    if form.is_valid():
        form.save()
        messages.success(request, _("Lịch khởi hành đã được tạo."))
        return redirect("tourism-schedule-list")
    return render(
        request,
        "tourism/schedule_form.html",
        {"form": form, "title": _("Tạo lịch khởi hành")},
    )


@login_required
def schedule_edit(request, pk):
    schedule = get_object_or_404(TourSchedule, pk=pk)
    form = TourScheduleForm(request.POST or None, instance=schedule)
    if form.is_valid():
        form.save()
        messages.success(request, _("Lịch khởi hành đã được cập nhật."))
        return redirect("tourism-schedule-list")
    return render(
        request,
        "tourism/schedule_form.html",
        {"form": form, "title": _("Chỉnh sửa lịch khởi hành")},
    )


@login_required
def schedule_delete(request, pk):
    schedule = get_object_or_404(TourSchedule, pk=pk)
    if request.method == "POST":
        schedule.delete()
        messages.success(request, _("Lịch khởi hành đã được xóa."))
    return redirect("tourism-schedule-list")


# ─── TourAttendance views ─────────────────────────────────────────────────────

@login_required
def attendance_list(request):
    qs = TourAttendance.objects.select_related(
        "tour_schedule__tour", "employee"
    ).order_by("-work_date")

    schedule_id = request.GET.get("schedule")
    if schedule_id:
        qs = qs.filter(tour_schedule_id=schedule_id)

    schedules = TourSchedule.objects.select_related("tour").order_by("-start_date")
    selected_schedule = None
    if schedule_id:
        selected_schedule = TourSchedule.objects.filter(pk=schedule_id).first()

    return render(
        request,
        "tourism/attendance_list.html",
        {
            "attendances": qs,
            "schedules": schedules,
            "selected_schedule": selected_schedule,
        },
    )


@login_required
def attendance_create(request):
    initial = {}
    if "schedule" in request.GET:
        initial["tour_schedule"] = request.GET["schedule"]
    form = TourAttendanceForm(request.POST or None, initial=initial)
    if form.is_valid():
        form.save()
        messages.success(request, _("Đã ghi nhận chấm công."))
        return redirect("tourism-attendance-list")
    return render(
        request,
        "tourism/attendance_form.html",
        {"form": form, "title": _("Chấm công theo tour")},
    )


@login_required
def attendance_edit(request, pk):
    att = get_object_or_404(TourAttendance, pk=pk)
    form = TourAttendanceForm(request.POST or None, instance=att)
    if form.is_valid():
        form.save()
        messages.success(request, _("Chấm công đã được cập nhật."))
        return redirect("tourism-attendance-list")
    return render(
        request,
        "tourism/attendance_form.html",
        {"form": form, "title": _("Chỉnh sửa chấm công")},
    )


@login_required
def attendance_delete(request, pk):
    att = get_object_or_404(TourAttendance, pk=pk)
    if request.method == "POST":
        att.delete()
        messages.success(request, _("Đã xóa bản ghi chấm công."))
    return redirect("tourism-attendance-list")


# ─── Dashboard ────────────────────────────────────────────────────────────────

@login_required
def dashboard(request):
    context = {
        "total_tours": Tour.objects.filter(status="active").count(),
        "total_guides": TourGuide.objects.filter(is_active=True).count(),
        "upcoming_schedules": TourSchedule.objects.filter(status__in=["scheduled", "confirmed"]).order_by("start_date")[:5],
        "ongoing_schedules": TourSchedule.objects.filter(status="ongoing").select_related("tour", "lead_guide__employee"),
    }
    return render(request, "tourism/dashboard.html", context)
