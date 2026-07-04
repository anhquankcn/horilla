"""Dựng file iCalendar (.ics) cho lịch HRM: nghỉ phép đã duyệt, ngày lễ, sự kiện.

RFC 5545: line endings CRLF, escape ký tự đặc biệt, all-day dùng VALUE=DATE với
DTEND exclusive (end_date + 1 ngày). Không phụ thuộc thư viện ngoài."""
from datetime import date, datetime, timedelta

DOMAIN = "qlns.hnhtravel.work"


def _esc(text) -> str:
    """Escape text theo RFC 5545 (backslash, ; , và xuống dòng)."""
    s = str(text or "")
    s = s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    s = s.replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n")
    return s


def _fold(line: str) -> str:
    """Gấp dòng > 75 octet (RFC 5545) — nối bằng CRLF + 1 space."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    out, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > 74:
            out.append(cur.decode("utf-8"))
            cur = b" " + b
        else:
            cur += b
    out.append(cur.decode("utf-8"))
    return "\r\n".join(out)


def _dt_date(d: date) -> str:
    return d.strftime("%Y%m%d")


def _now_stamp() -> str:
    return datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")


def build_vevent(uid: str, start: date, end: date | None, summary: str,
                 description: str = "", category: str = "") -> list[str]:
    """1 VEVENT all-day. end = ngày kết thúc (inclusive) — DTEND sẽ +1 (exclusive)."""
    end_excl = (end or start) + timedelta(days=1)
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}@{DOMAIN}",
        f"DTSTAMP:{_now_stamp()}",
        f"DTSTART;VALUE=DATE:{_dt_date(start)}",
        f"DTEND;VALUE=DATE:{_dt_date(end_excl)}",
        _fold(f"SUMMARY:{_esc(summary)}"),
    ]
    if description:
        lines.append(_fold(f"DESCRIPTION:{_esc(description)}"))
    if category:
        lines.append(f"CATEGORIES:{_esc(category)}")
    lines.append("TRANSP:TRANSPARENT")
    lines.append("END:VEVENT")
    return lines


def build_calendar(vevents: list[list[str]], name: str = "HNH Travel — Lịch nhân sự") -> str:
    """Bọc các VEVENT thành 1 VCALENDAR hoàn chỉnh (CRLF)."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//HNH Travel//HRM Calendar//VI",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        _fold(f"X-WR-CALNAME:{_esc(name)}"),
        "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
    ]
    for ev in vevents:
        lines.extend(ev)
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


# ─── Nguồn sự kiện HRM ───

def leave_events(employee) -> list[list[str]]:
    """Nghỉ phép ĐÃ DUYỆT của 1 nhân viên."""
    from leave.models import LeaveRequest
    out = []
    qs = LeaveRequest.objects.filter(
        employee_id=employee, status="approved"
    ).select_related("leave_type_id")
    for lr in qs:
        lt = getattr(lr.leave_type_id, "name", "Nghỉ phép")
        summary = f"Nghỉ phép: {lt}"
        desc_parts = [f"Loại: {lt}"]
        if lr.requested_days:
            desc_parts.append(f"Số ngày: {lr.requested_days}")
        if lr.is_hourly and lr.start_time and lr.end_time:
            desc_parts.append(f"Theo giờ: {lr.start_time:%H:%M}–{lr.end_time:%H:%M}")
        if lr.description:
            desc_parts.append(str(lr.description))
        out.append(build_vevent(
            uid=f"leave-{lr.id}", start=lr.start_date, end=lr.end_date,
            summary=summary, description=" | ".join(desc_parts), category="Nghỉ phép",
        ))
    return out


def holiday_events(company=None) -> list[list[str]]:
    """Ngày lễ (toàn công ty của nhân viên; company=None → tất cả)."""
    from base.models import Holidays
    out = []
    qs = Holidays.objects.all()
    if company is not None:
        qs = qs.filter(models_company_or_null(company))
    for h in qs:
        out.append(build_vevent(
            uid=f"holiday-{h.id}", start=h.start_date, end=h.end_date,
            summary=f"Nghỉ lễ: {h.name}", category="Ngày lễ",
        ))
    return out


def models_company_or_null(company):
    """Q: holiday của đúng company HOẶC không gắn company (áp chung)."""
    from django.db.models import Q
    return Q(company_id=company) | Q(company_id__isnull=True)


def announcement_events(user) -> list[list[str]]:
    """Sự kiện/thông báo CÓ MỐC THỜI GIAN (expire_date) mà user là người nhận."""
    from base.models import Announcement
    from django.db.models import Q
    out = []
    emp = getattr(user, "employee_get", None)
    qs = Announcement.objects.filter(expire_date__isnull=False).distinct()
    # lọc theo đối tượng nhận: gửi cho employee / phòng / vị trí / công ty của user,
    # hoặc announcement không nhắm ai (toàn công ty)
    if emp is not None:
        dept = getattr(getattr(emp, "employee_work_info", None), "department_id", None)
        jp = getattr(getattr(emp, "employee_work_info", None), "job_position_id", None)
        comp = None
        try:
            comp = emp.get_company()
        except Exception:
            comp = None
        cond = Q(employees=emp)
        if dept: cond |= Q(department=dept)
        if jp: cond |= Q(job_position=jp)
        if comp: cond |= Q(company_id=comp)
        # announcement không nhắm đối tượng nào → coi là toàn công ty
        cond |= Q(employees__isnull=True, department__isnull=True,
                  job_position__isnull=True, company_id__isnull=True)
        qs = qs.filter(cond).distinct()
    for a in qs:
        out.append(build_vevent(
            uid=f"announce-{a.id}", start=a.expire_date, end=a.expire_date,
            summary=f"Sự kiện: {a.title}",
            description=str(a.description or ""), category="Sự kiện",
        ))
    return out


def build_user_feed(user) -> str:
    """Toàn bộ lịch HRM của 1 user: nghỉ phép + lễ + sự kiện."""
    emp = getattr(user, "employee_get", None)
    company = None
    if emp is not None:
        try:
            company = emp.get_company()
        except Exception:
            company = None
    vevents = []
    if emp is not None:
        vevents += leave_events(emp)
    vevents += holiday_events(company)
    vevents += announcement_events(user)
    return build_calendar(vevents)
