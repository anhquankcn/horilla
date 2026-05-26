"""
salary_data.py

Dữ liệu mức lương tháng (VND) theo vị trí — ngành du lịch/lữ hành VN 2025-2026.
Nguồn: Navigos, VietnamWorks, khảo sát nội bộ ngành Lữ hành 2025.

Dùng bởi:
  - setup_uat_contracts management command
  - KPI Phụ lục 1 API endpoint (hnh_positions_api)
"""

import unicodedata

# ─── (monthly_min, monthly_max) — gross trước thuế ───────────────────────────
SALARY_MAP: dict[str, tuple[int, int]] = {
    # ── Cấp lãnh đạo cấp cao ─────────────────────────────────────────────────
    "Tong Giam Doc":                           (80_000_000, 150_000_000),
    "Chu Tich HDQT":                           (100_000_000, 200_000_000),
    "Thanh vien HDQT":                         (50_000_000, 100_000_000),
    "Co Van Cao Cap":                          (40_000_000,  80_000_000),
    "Giam doc dieu hanh":                      (35_000_000,  70_000_000),
    "Pho Giam doc":                            (25_000_000,  50_000_000),
    "Pho Giam Doc":                            (25_000_000,  50_000_000),
    # ── Cấp giám đốc phòng / chi nhánh ──────────────────────────────────────
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
    # ── Trưởng phòng / Bộ phận ───────────────────────────────────────────────
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
    # ── Team Leader ──────────────────────────────────────────────────────────
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
    # ── Chuyên viên ──────────────────────────────────────────────────────────
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
    # ── Kế toán ──────────────────────────────────────────────────────────────
    "Ke toan vien":                            (12_000_000,  20_000_000),
    "Ke toan Cty VMB":                         (12_000_000,  20_000_000),
    "Nhan vien ke toan":                       (10_000_000,  18_000_000),
    "Nhan vien ke toan Tour":                  (10_000_000,  18_000_000),
    "Nhan vien ke toan cong no":               (10_000_000,  18_000_000),
    "Nhan vien ke toan cong no va thu hoi hoa don": (10_000_000, 18_000_000),
    "Nhan vien ke toan thue":                  (11_000_000,  20_000_000),
    "Nhan vien thu chi":                       (9_500_000,   16_000_000),
    "Thu quy":                                 (9_000_000,   14_000_000),
    # ── Điều hành / HDV tour ─────────────────────────────────────────────────
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
    # ── Booker / Purchasing / Vé máy bay ─────────────────────────────────────
    "Nhan vien booker":                        (10_000_000,  17_000_000),
    "Nhan vien Purchasing":                    (10_000_000,  17_000_000),
    "Nhan vien dat dich vu khach Corp":        (11_000_000,  18_000_000),
    # ── Kinh doanh / Marketing ───────────────────────────────────────────────
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
    # ── CSKH / Nhân viên tư vấn ──────────────────────────────────────────────
    "Nhan vien tu van":                        (10_000_000,  17_000_000),
    # ── CNTT ─────────────────────────────────────────────────────────────────
    "Lap trinh vien":                          (18_000_000,  35_000_000),
    "Quan tri he thong":                       (15_000_000,  28_000_000),
    "Admin du an Cong nghe thong tin":         (13_000_000,  22_000_000),
    # ── HR / Hành chính ──────────────────────────────────────────────────────
    "Phu trach Phap che":                      (14_000_000,  26_000_000),
    "Thu ky Chu tich HDQT":                    (12_000_000,  22_000_000),
    "Tro ly Giam Doc Marketing":               (11_000_000,  20_000_000),
    "Tro ly Ms.Quan":                          (11_000_000,  20_000_000),
    "Thuc tap sinh Nhan su":                   (4_000_000,    7_000_000),
    "Le tan":                                  (9_000_000,   14_000_000),
    "Nhan vien hanh chinh":                    (9_000_000,   15_000_000),
    # ── Vận chuyển / Hỗ trợ ─────────────────────────────────────────────────
    "Lai xe":                                  (9_000_000,   15_000_000),
    "Nhan vien dieu phoi xe":                  (10_000_000,  16_000_000),
    "Nhan vien Tai xe":                        (9_000_000,   14_000_000),
    "Nhan vien Tap vu":                        (6_000_000,    9_000_000),
    "Nhan vien Giao nhan":                     (8_000_000,   13_000_000),
    "Bao ve":                                  (7_000_000,   11_000_000),
    # ── Mặc định ─────────────────────────────────────────────────────────────
    "Nhan vien":                               (9_000_000,   15_000_000),
}

_LEVEL_RULES = [
    (["tong giam doc", "chief executive"],         (80_000_000, 150_000_000)),
    (["chu tich"],                                  (80_000_000, 160_000_000)),
    (["giam doc", "director"],                      (25_000_000,  55_000_000)),
    (["pho giam doc", "deputy director"],           (20_000_000,  42_000_000)),
    (["truong phong", "truong ban", "truong bo phan", "truong nhom"], (14_000_000, 30_000_000)),
    (["pho phong", "pho ban"],                      (12_000_000,  25_000_000)),
    (["team leader", "team laeder"],                (12_000_000,  24_000_000)),
    (["chuyen vien", "ke toan truong"],             (12_000_000,  22_000_000)),
    (["ke toan vien", "nhan vien ke toan"],         (10_000_000,  18_000_000)),
    (["thu quy"],                                   (8_500_000,   14_000_000)),
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
    text = text.lower().strip()
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def get_salary(position_name: str) -> tuple[int, int]:
    """Return (monthly_min, monthly_max) for a given position name."""
    if not position_name:
        return DEFAULT_SALARY
    norm = _normalize(position_name)
    for key, val in SALARY_MAP.items():
        if _normalize(key) == norm:
            return val
    for keywords, sal in _LEVEL_RULES:
        if any(kw in norm for kw in keywords):
            return sal
    return DEFAULT_SALARY


def get_annual_salary(position_name: str) -> tuple[int, int, int]:
    """Return (annual_min, annual_max, monthly_advance) for a position.

    annual = 12 months + 1.5 bonus months (travel industry standard).
    monthly_advance = midpoint of monthly range (first advance payment estimate).
    """
    m_min, m_max = get_salary(position_name)
    annual_min = m_min * 12
    annual_max = int(m_max * 13.5)
    monthly_advance = int((m_min + m_max) / 2)
    return annual_min, annual_max, monthly_advance
