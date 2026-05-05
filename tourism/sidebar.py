"""tourism/sidebar.py - Cấu hình sidebar cho module Du lịch"""

from django.urls import reverse_lazy
from django.utils.translation import gettext_lazy as _

MENU = _("Du lịch")
IMG_SRC = "images/ui/tourism.svg"
ACCESSIBILITY = "tourism.sidebar.menu_accessibility"

SUBMENUS = [
    {
        "menu": _("Tổng quan"),
        "redirect": reverse_lazy("tourism-dashboard"),
        "accessibility": "tourism.sidebar.default_accessibility",
    },
    {
        "menu": _("Danh sách tour"),
        "redirect": reverse_lazy("tourism-tour-list"),
        "accessibility": "tourism.sidebar.default_accessibility",
    },
    {
        "menu": _("Hướng dẫn viên"),
        "redirect": reverse_lazy("tourism-guide-list"),
        "accessibility": "tourism.sidebar.default_accessibility",
    },
    {
        "menu": _("Lịch khởi hành"),
        "redirect": reverse_lazy("tourism-schedule-list"),
        "accessibility": "tourism.sidebar.default_accessibility",
    },
    {
        "menu": _("Chấm công tour"),
        "redirect": reverse_lazy("tourism-attendance-list"),
        "accessibility": "tourism.sidebar.default_accessibility",
    },
]


def menu_accessibility(request, _menu="", user_perms=[], *args, **kwargs):
    return request.user.is_authenticated


def default_accessibility(request, submenu, user_perms, *args, **kwargs):
    return request.user.is_authenticated
