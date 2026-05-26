"""
management/commands/setup_uat_contracts.py

Tao Hop dong UAT PM cho tat ca nhan vien dang lam viec.
- Ngay bat dau = date_joining cua nhan vien
- Luong = muc trung binh thi truong nganh du lich/lu hanh VN 2025-2026
- Thu nhap nam min/max theo vi tri => Phu luc 1

Chay:
    python manage.py setup_uat_contracts
    python manage.py setup_uat_contracts --force   # ghi de neu da co
    python manage.py setup_uat_contracts --dry-run # xem truoc, khong luu
"""

import logging
from datetime import date

from django.core.management.base import BaseCommand

from employee.models import Employee
from payroll.models.contract_models import TrialContract

logger = logging.getLogger(__name__)

# ─── Muc luong thang (VND) theo vi tri — nganh du lich/lu hanh VN 2025-2026 ─
# (monthly_min, monthly_max) — gross truoc thue
# Nguon: Navigos, VietnamWorks, khao sat noi bo nganh Lu hanh 2025

SALARY_MAP: dict[str, tuple[int, int]] = {
    # ── Cap lanh dao cap cao ──────────────────────────────────────────────────
    "Tong Giam Doc":                           (80_000_000, 150_000_000),
    "Chu Tich HDQT":                           (100_000_000, 200_000_000),
    "Thanh vien HDQT":                         (50_000_000, 100_000_000),
    "Co Van Cao Cap":                          (40_000_000,  80_000_000),
    "Giam doc dieu hanh":                      (35_000_000,  70_000_000),
    "Pho Giam doc":                            (25_000_000,  50_000_000),
    "Pho Giam Doc":                            (25_000_000,  50_000_000),
    # ── Cap giam doc phong / chi nhanh ───────────────────────────────────────
    "Giam Doc Marketing":                      (28_000_000,  55_000_000),
    "Giam Doc Lu Hanh":                        (28_000_000,  55_000_000),
    "Giam Doc Tai Chinh - Ke toan":            (35_000_000,  70_000_000),
    "Giam doc Thuong mai":                     (28_000_000,  55_000_000),
    "Giam doc Doi moi van hanh":               (25_000_000,  50_000_000),
    "Giam doc CNTT":                           (28_000_000,  55_000_000),
    "Giam doc HCNS & Phap che":                (25_000_000,  50_000_000),
    "Giam doc kinh doanh":                     (28_000_000,  55_000_000),
    "Giam doc Chi nhanh Ha Noi":               (25_000_000,  50_000_000),
    "Pho Giam doc Kinh doanh":                 (20_000_000,  42_000_000),
    # ── Truong phong / Bo phan ────────────────────────────────────────────────
    "Ke Toan Truong":                          (18_000_000,  38_000_000),
    "Truong Phong Hanh Chanh Nhan Su":         (16_000_000,  32_000_000),
    "Truong Phong Kinh Doanh":                 (18_000_000,  38_000_000),
    "Truong phong Marketing":                  (16_000_000,  32_000_000),
    "Truong phong Du lich":                    (18_000_000,  38_000_000),
    "Truong phong Dieu hanh":                  (18_000_000,  38_000_000),
    "Truong phong Ke toan Tour":               (16_000_000,  30_000_000),
    "Truong Phong Ke Toan Ve":                 (16_000_000,  30_000_000),
    "Truong phong TMC":                        (16_000_000,  30_000_000),
    "Truong phong CSKH":                       (14_000_000,  26_000_000),
    "Truong phong IT":                         (20_000_000,  40_000_000),
    "Truong phong phat trien he thong":        (22_000_000,  45_000_000),
    "Truong Ban Kiem toan noi bo":             (18_000_000,  38_000_000),
    "Truong Nhom Marketing":                   (14_000_000,  26_000_000),
    "Truong nhom dao tao":                     (14_000_000,  26_000_000),
    "Truong BP Cham soc khach hang":           (14_000_000,  26_000_000),
    "Truong bo phan ke toan":                  (14_000_000,  28_000_000),
    "Truong bo phan dao tao - nghiep vu":      (14_000_000,  26_000_000),
    "Truong Phong Ve May Bay":                 (16_000_000,  30_000_000),
    "Truong phong dich vu visa Nhap canh":     (14_000_000,  26_000_000),
    "Truong phong dich vu visa Xuat canh":     (14_000_000,  26_000_000),
    "Truong phong Van chuyen":                 (13_000_000,  24_000_000),
    "Truong Phong Ve May Bay":                 (16_000_000,  30_000_000),
    "Pho Phong Hanh Chanh Nhan Su":            (13_000_000,  24_000_000),
    "Pho Phong Ve May Bay":                    (13_000_000,  24_000_000),
    "Pho phong Du lich":                       (14_000_000,  26_000_000),
    "Pho BP Cham soc khach hang":              (12_000_000,  22_000_000),
    "Pho phong TMC":                           (14_000_000,  26_000_000),
    "Pho phong dich vu visa Nhap & Xuat canh": (13_000_000,  24_000_000),
    "Pho phong Ve AGT":                        (13_000_000,  22_000_000),
    "Pho Phong Ke Toan Thue":                  (14_000_000,  26_000_000),
    "Pho phong Ve OTA":                        (13_000_000,  22_000_000),
    "Pho phong Ve CORP":                       (13_000_000,  22_000_000),
    "Pho phong dao tao - nghiep vu":           (12_000_000,  22_000_000),
    # ── Team Leader ───────────────────────────────────────────────────────────
    "TEAM LEADER":                             (13_000_000,  24_000_000),
    "Team Leader AGT -Global":                 (14_000_000,  25_000_000),
    "Team Leader AGT -Local":                  (13_000_000,  23_000_000),
    "Team Leader Corp":                        (14_000_000,  25_000_000),
    "Team Leader KH DN khac":                  (13_000_000,  23_000_000),
    "Team Leader KH Pepsi":                    (13_000_000,  23_000_000),
    "Team Leader KH bao hiem":                 (13_000_000,  23_000_000),
    "Team Leader Purchasing":                  (12_000_000,  22_000_000),
    "Team Laeder Tour Inbound":                (13_000_000,  23_000_000),
    "Team Leader BSP, Online QT, BH":          (13_000_000,  23_000_000),
    "Team Leader VN":                          (13_000_000,  23_000_000),
    "Team Leader tu van visa":                 (13_000_000,  22_000_000),
    # ── Chuyen vien ───────────────────────────────────────────────────────────
    "Chuyen vien":                             (12_000_000,  22_000_000),
    "Chuyen vien Kinh doanh":                  (12_000_000,  22_000_000),
    "Chuyen vien SEO/Digital":                 (13_000_000,  23_000_000),
    "Chuyen vien Digital Marketing":           (13_000_000,  23_000_000),
    "Chuyen vien Marketing tong hop":          (12_000_000,  22_000_000),
    "Chuyen vien Nhan su":                     (12_000_000,  20_000_000),
    "Chuyen vien kinh doanh khach doan":       (12_000_000,  22_000_000),
    "Chuyen vien Dieu hanh":                   (12_000_000,  22_000_000),
    "Chuyen vien phap che":                    (14_000_000,  25_000_000),
    "Chuyen vien Hanh chinh tong hop":         (11_000_000,  19_000_000),
    "Chuyen vien Kho van":                     (11_000_000,  18_000_000),
    "Chuyen vien Mua hang":                    (12_000_000,  20_000_000),
    "Chuyen vien QLTS":                        (11_000_000,  19_000_000),
    "Chuyen vien tien luong va phuc loi (C&B)": (14_000_000, 25_000_000),
    "Chuyen vien tuyen dung":                  (12_000_000,  22_000_000),
    "Chuyen vien Bien tap kiem nguoi viet noi dung": (12_000_000, 20_000_000),
    "Chuyen vien Content SEO":                 (12_000_000,  20_000_000),
    "Chuyen vien CSKH":                        (11_000_000,  18_000_000),
    "Chuyen vien booker":                      (12_000_000,  20_000_000),
    # ── Ke toan ───────────────────────────────────────────────────────────────
    "Ke toan vien":                            (12_000_000,  20_000_000),
    "Ke toan Cty VMB":                         (12_000_000,  20_000_000),
    "Nhan vien ke toan":                       (10_000_000,  18_000_000),
    "Nhan vien ke toan Tour":                  (10_000_000,  18_000_000),
    "Nhan vien ke toan cong no":               (10_000_000,  18_000_000),
    "Nhan vien ke toan cong no va thu hoi hoa don": (10_000_000, 18_000_000),
    "Nhan vien ke toan thue":                  (11_000_000,  20_000_000),
    "Nhan vien thu chi":                       (9_500_000,   16_000_000),
    "Thu quy":                                 (9_000_000,   14_000_000),
    # ── Dieu hanh / HDV tour ──────────────────────────────────────────────────
    "Dieu hanh vien Tour noi dia":             (12_000_000,  20_000_000),
    "Dieu hanh vien Tour quoc te":             (13_000_000,  22_000_000),
    "Nhan vien Dieu hanh":                     (11_000_000,  18_000_000),
    "Huong dan vien Tour noi dia":             (10_000_000,  18_000_000),
    "Huong dan vien Tour quoc te":             (12_000_000,  22_000_000),
    "Huong dan vien tieng Anh":                (13_000_000,  24_000_000),
    "Huong dan vien tieng Hoa":                (14_000_000,  26_000_000),
    "Nhan vien to chuc su kien":               (11_000_000,  20_000_000),
    "Nhan vien kinh doanh khach le":           (11_000_000,  20_000_000),
    "Nhan vien kinh doanh khach doan":         (11_000_000,  20_000_000),
    # ── Booker / Purchasing / Ve may bay ─────────────────────────────────────
    "Nhan vien booker":                        (10_000_000,  17_000_000),
    "Nhan vien Purchasing":                    (10_000_000,  17_000_000),
    "Nhan vien dat dich vu khach Corp":        (11_000_000,  18_000_000),
    # ── Kinh doanh / Marketing ────────────────────────────────────────────────
    "Nhan vien kinh doanh":                    (11_000_000,  22_000_000),
    "Nhan vien Marketing":                     (10_000_000,  18_000_000),
    "Nhan vien Content":                       (9_000_000,   16_000_000),
    "Nhan vien Video editor":                  (11_000_000,  20_000_000),
    "Nhan vien thiet ke":                      (11_000_000,  20_000_000),
    "Nhan vien Marketing tong hop":            (10_000_000,  18_000_000),
    "Nhan vien Admin":                         (9_000_000,   15_000_000),
    # ── Visa ─────────────────────────────────────────────────────────────────
    "Nhan vien tu van visa":                   (11_000_000,  18_000_000),
    "Nhan vien xu ly ho so visa":              (10_000_000,  17_000_000),
    "Nhan vien visa Nhap canh":                (10_000_000,  17_000_000),
    "Nhan vien dich thuat tieng anh":          (12_000_000,  22_000_000),
    # ── CSKH / Nhan vien tu van ───────────────────────────────────────────────
    "Nhan vien tu van":                        (10_000_000,  17_000_000),
    # ── CNTT ─────────────────────────────────────────────────────────────────
    "Lap trinh vien":                          (18_000_000,  35_000_000),
    "Quan tri he thong":                       (15_000_000,  28_000_000),
    "Admin du an Cong nghe thong tin":         (13_000_000,  22_000_000),
    # ── HR / Hanh chinh ───────────────────────────────────────────────────────
    "Phu trach Phap che":                      (14_000_000,  26_000_000),
    "Thu ky Chu tich HDQT":                    (12_000_000,  22_000_000),
    "Tro ly Giam Doc Marketing":               (11_000_000,  20_000_000),
    "Tro ly Ms.Quan":                          (11_000_000,  20_000_000),
    "Thuc tap sinh Nhan su":                   (4_000_000,    7_000_000),
    "Le tan":                                  (9_000_000,   14_000_000),
    "Nhan vien hanh chinh":                    (9_000_000,   15_000_000),
    # ── Van chuyen / Ho tro ───────────────────────────────────────────────────
    "Lai xe":                                  (9_000_000,   15_000_000),
    "Nhan vien dieu phoi xe":                  (10_000_000,  16_000_000),
    "Nhan vien Tai xe":                        (9_000_000,   14_000_000),
    "Nhan vien Tap vu":                        (6_000_000,    9_000_000),
    "Nhan vien Giao nhan":                     (8_000_000,   13_000_000),
    "Bao ve":                                  (7_000_000,   11_000_000),
    # ── Mac dinh (chua co trong bang) ─────────────────────────────────────────
    "Nhan vien":                               (9_000_000,   15_000_000),
}

# Fallback theo cap bac phat hien tu ten vi tri
_LEVEL_RULES = [
    (["tong giam doc", "chief executive"],         (80_000_000, 150_000_000)),
    (["chu tich"],                                  (80_000_000, 160_000_000),),
    (["giam doc", "director"],                      (25_000_000,  55_000_000)),
    (["pho giam doc", "deputy director"],           (20_000_000,  42_000_000)),
    (["truong phong", "truong ban", "truong bo phan", "truong nhom"], (14_000_000, 30_000_000)),
    (["pho phong", "pho ban"],                      (12_000_000,  25_000_000)),
    (["team leader", "team laeder"],                (12_000_000,  24_000_000)),
    (["chuyen vien", "ke toan truong"],             (12_000_000,  22_000_000)),
    (["ke toan vien", "nhan vien ke toan"],         (10_000_000,  18_000_000)),
    (["thu quy", "thu quy"],                        (8_500_000,   14_000_000)),
    (["lap trinh", "developer"],                    (18_000_000,  38_000_000)),
    (["huong dan vien", "tour guide"],              (10_000_000,  24_000_000)),
    (["dieu hanh vien"],                            (12_000_000,  22_000_000)),
    (["lai xe", "tai xe"],                          (8_500_000,   14_000_000)),
    (["tap vu"],                                    (5_500_000,    9_000_000)),
    (["bao ve"],                                    (6_500_000,   10_000_000)),
    (["thuc tap"],                                  (3_500_000,    6_000_000)),
]

DEFAULT_SALARY = (9_000_000, 15_000_000)


def _normalize(text: str) -> str:
    """Lowercase + strip accents for fuzzy matching."""
    import unicodedata
    text = text.lower().strip()
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _get_salary(position_name: str) -> tuple[int, int]:
    """Return (monthly_min, monthly_max) for a given position name."""
    if not position_name:
        return DEFAULT_SALARY
    norm = _normalize(position_name)
    # Exact match (normalized)
    for key, val in SALARY_MAP.items():
        if _normalize(key) == norm:
            return val
    # Partial / fuzzy match via level rules
    for keywords, sal in _LEVEL_RULES:
        if any(kw in norm for kw in keywords):
            return sal
    return DEFAULT_SALARY


class Command(BaseCommand):
    help = "Tao Hop dong UAT PM cho tat ca nhan vien dang lam viec"

    def add_arguments(self, parser):
        parser.add_argument("--force",   action="store_true", help="Ghi de neu da co hop dong UAT PM")
        parser.add_argument("--dry-run", action="store_true", help="Xem truoc, khong luu vao DB")

    def handle(self, *args, **options):
        force   = options["force"]
        dry_run = options["dry_run"]

        employees = (
            Employee.objects.filter(is_active=True)
            .select_related(
                "employee_work_info__job_position_id",
                "employee_work_info__department_id",
            )
            .order_by("employee_work_info__department_id__department",
                      "employee_work_info__job_position_id__job_position")
        )

        self.stdout.write(f"Tim thay {employees.count()} nhan vien dang lam viec.\n")
        if dry_run:
            self.stdout.write("[DRY-RUN] Khong luu vao DB.\n")

        created = skipped = updated = error = 0
        UAT_YEAR = 2026

        for emp in employees:
            wi = getattr(emp, "employee_work_info", None)
            pos_obj  = wi.job_position_id if wi else None
            pos_name = pos_obj.job_position if pos_obj else ""
            dept     = wi.department_id.department if (wi and wi.department_id) else ""
            join_dt  = wi.date_joining if wi else None

            if not join_dt:
                self.stdout.write(f"  [SKIP] {emp.get_full_name()} — chua co ngay tham gia")
                skipped += 1
                continue

            monthly_min, monthly_max = _get_salary(pos_name)
            monthly_mid = int((monthly_min + monthly_max) / 2)

            # Annual package: 12 months + bonus (1.5 months for travel industry)
            annual_min = monthly_min * 12
            annual_max = int(monthly_max * 13.5)

            contract_name = f"UAT PM — {emp.get_full_name()} — {pos_name or 'Nhan vien'}"

            existing = TrialContract.objects.filter(employee_id=emp).first()

            if existing and not force:
                self.stdout.write(
                    f"  [SKIP] {emp.get_full_name()} — da co UAT PM (dung --force de ghi de)"
                )
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(
                    f"  [DRY] {emp.get_full_name()} | {pos_name} | {dept} | "
                    f"tham gia:{join_dt} | luong:{monthly_mid:,} | "
                    f"nam [{annual_min:,} – {annual_max:,}]"
                )
                created += 1
                continue

            try:
                if existing and force:
                    existing.delete()

                contract = TrialContract.objects.create(
                    employee_id=emp,
                    contract_name=contract_name,
                    contract_start_date=join_dt,
                    wage=monthly_mid,
                    trial_wage_pct=100,
                    probation_days=90,
                    contract_status="active",
                    consent_agreed=False,
                )

                if force and existing:
                    self.stdout.write(
                        f"  [UPDATE] {emp.get_full_name()} | {pos_name} | {monthly_mid:,}d/thang"
                    )
                    updated += 1
                else:
                    self.stdout.write(
                        f"  [OK] {emp.get_full_name()} | {pos_name} | {monthly_mid:,}d/thang"
                    )
                    created += 1

            except Exception as exc:
                self.stdout.write(f"  [ERROR] {emp.get_full_name()} — {exc}")
                error += 1

        self.stdout.write(
            f"\n=== Ket qua: Tao moi={created} | Cap nhat={updated} | "
            f"Bo qua={skipped} | Loi={error} ==="
        )
