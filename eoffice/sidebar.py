"""eoffice/sidebar.py — Sidebar navigation configuration."""

from django.urls import reverse_lazy
from django.utils.translation import gettext_lazy as _

MENU = _("eOffice")
IMG_SRC = "images/ui/eoffice.svg"
ACCESSIBILITY = "eoffice.sidebar.menu_accessibility"

SUBMENUS = [
    {
        "menu": _("Bảng Công việc"),
        "redirect": reverse_lazy("eoffice-board"),
        "accessibility": "eoffice.sidebar.default_accessibility",
    },
    {
        "menu": _("Tổng quan (CEO)"),
        "redirect": reverse_lazy("eoffice-dashboard"),
        "accessibility": "eoffice.sidebar.dashboard_accessibility",
    },
    {
        "menu": _("1StopShop (Task)"),
        "redirect": reverse_lazy("deeplink-tasks"),
        "accessibility": "eoffice.sidebar.default_accessibility",
    },
    {
        "menu": _("Gán lịch bận"),
        "redirect": reverse_lazy("eoffice-labelday"),
        "accessibility": "eoffice.sidebar.labelday_accessibility",
    },
]


def menu_accessibility(request, _menu="", user_perms=[], *args, **kwargs):
    return request.user.is_authenticated


def default_accessibility(request, submenu, user_perms, *args, **kwargs):
    return request.user.is_authenticated


def dashboard_accessibility(request, submenu, user_perms, *args, **kwargs):
    return request.user.is_authenticated and (
        request.user.is_superuser or request.user.has_perm("eoffice.change_worktask")
    )


def labelday_accessibility(request, submenu, user_perms, *args, **kwargs):
    return request.user.is_authenticated and (
        request.user.is_superuser or request.user.has_perm("eoffice.change_employeedaylabel")
    )
