# Horilla HRM — Công ty Du lịch Hồng Ngọc Hà

Horilla HRM customized cho **Công ty Du lịch Hồng Ngọc Hà** (hongngocha.com).
Branch làm việc chính: `horilla_aqv10`. Merge về `1.0` khi release.

## Thông tin công ty

| Trường | Giá trị |
|--------|---------|
| Tên | Công ty Du lịch Hồng Ngọc Hà |
| Địa chỉ | 185-187 Lê Thánh Tôn, P. Bến Thành, Q.1, TP.HCM |
| Website | hongngocha.com |
| Múi giờ | Asia/Ho_Chi_Minh (UTC+7) |
| Ngôn ngữ mặc định | Tiếng Việt (`vi`) |

## Khởi tạo dữ liệu lần đầu

```bash
# Tạo công ty, phòng ban, vị trí, ca làm, loại nghỉ phép
python manage.py setup_hnh_company

# Nếu cần ghi đè dữ liệu đã tồn tại
python manage.py setup_hnh_company --force

# Bỏ qua một phần
python manage.py setup_hnh_company --skip-leave --skip-shift
```

Sau khi chạy xong: **Admin > Companies** → upload logo công ty để branding xuất hiện trên sidebar & login.

## Kiến trúc Customization

### Branding (White-label)
- `horilla/horilla_apps.py` — `WHITE_LABELLING = True`
- Context var `white_label_company` / `white_label_company_name` inject qua `base/context_processors.py`
- **Logo fallback**: ui-avatars.com khi chưa upload logo (xử lý trong `base/context_processors.py`)

### Templates ghi đè (theo thứ tự ưu tiên)
1. `horilla_theme/templates/` — theme chính (sidebar, floating button)
2. `templates/` — override root (login, index, navbar)

### Files đã customize
| File | Thay đổi |
|------|----------|
| `templates/login.html` | Branding HNH, nút HNHSSO, placeholder email, SweetAlert tiếng Việt |
| `horilla_theme/templates/.../sidebar.html` | Logo fallback SVG HNH |
| `horilla_theme/templates/floating_button.html` | FAB button đỏ `#ff3b38` |
| `horilla_theme/static/.../global.css` | CSS variables brand HNH |
| `horilla/settings.py` | Ngôn ngữ VI, timezone HCM, OIDC Keycloak |
| `horilla/horilla_apps.py` | WHITE_LABELLING, SIDEBARS |
| `horilla/locale/vi/LC_MESSAGES/django.po` | Bản dịch tiếng Việt (~4500 entries) |

### Màu brand HNH
```css
--hnh-primary:       #c0222b   /* đỏ crimson chính */
--hnh-primary-dark:  #9a1a21
--hnh-primary-light: rgba(192,34,43,0.10)
--hnh-gold:          #d4a017   /* vàng du lịch */
```

## SSO / Xác thực

Keycloak OIDC tích hợp qua `mozilla_django_oidc`:
- Realm: `HNHTravel-SGN` tại `https://sso.hnhtravel.work`
- Client: `horilla-hrm`
- Custom backend: `horilla/oidc_backend.py`
- Route: `/oidc/` → nút "Đăng nhập qua HNHSSO" trên trang login
- SSO-only: local login đã tắt, force qua OIDC

## Hệ thống Hợp đồng HNH (3 loại)

Models tại `payroll/models/contract_models.py`, kế thừa `ContractBase`:

| Model | Mô tả | Đặc điểm |
|-------|--------|----------|
| `TrialContract` | Hợp đồng UAT PM | `probation_days`, `trial_wage_pct`, `base_salary` |
| `OfficialContract` | Hợp đồng Chính thức | Chỉ có `wage` (G=H=wage) |
| `PerformanceContract` | Hợp đồng Hiệu suất | `base_salary`, KPI appendix |

Bảng phụ:
- `ContractKPIAppendix` — Phụ lục 1: KPI & Thu nhập năm (cho Trial + Performance)
- `MonthlyPayrollEntry` — Bảng lương tháng, 1 row/employee/month

### Công thức lương theo loại HĐ
- **Trial**: G = wage × trial_wage_pct/100, H = G + base_salary
- **Performance**: G = wage, H = wage + base_salary
- **Official**: G = wage, H = wage
- **Horilla native**: G = H = wage

## Bảng lương (Payroll Overview)

Views: `payroll/views/contract_hnh_views.py`
Template: `payroll/templates/payroll/contracts_hnh/payroll_overview.html`

### Tính năng
- Generate stubs lọc theo **Công ty / Phòng ban / Loại hợp đồng** (Horilla, Trial, Official, Performance)
- Kiểm tra tình trạng HĐ: wage=0, hết hạn, trial quá probation_days, trùng HĐ active
- Công thức Python + JavaScript realtime (cột J→AK)
- Cột chính: E=ngày chuẩn, F=ngày thực, G=LCB BHXH, H=Gross, I=PC chức vụ, K=LHS Pool, L=PC đi lại, O=ca đêm, S/T=OT, V=KPI, AB=Gross thực tế, AC-AF=BHXH/BHYT/BHTN/TNCN, AH=NPT, AI=Net, AK=Thực nhận

## Import chấm công HNH

View: `attendance/views/hnh_import.py`
- Upload file Excel từ máy chấm công HNH
- Columns: Mã nhân sự | Tên | Khu vực | Ngày | Giờ vào | Giờ ra | All data | IP
- Match nhân viên qua `badge_id`, skip ngày vắng, duplicate guard

## Work Level (Cấp bậc nội bộ)

Model: `employee/models.py` → `WorkLevel`
Views: `employee/work_level_views.py`
- 8 cấp bậc nội bộ với benefits (nghỉ phép, thưởng, bảo hiểm...)
- Tab hiển thị trong profile nhân viên
- Auto-assign theo phòng ban/vị trí

## Dữ liệu Nghiệp vụ Du lịch

### Phòng ban (10 phòng)
Ban Giám Đốc, Nhân sự, Kế toán, Kinh doanh & Marketing, Điều hành Tour,
Hướng dẫn viên, Vận chuyển, CNTT, Hành chính - Lễ tân, CSKH

### Ca làm việc (7 ca)
- Ca hành chính (8h–17h)
- Ca hướng dẫn viên sáng (6h–15h) / chiều (13h–22h)
- Ca lái xe sáng (5h–14h) / chiều (13h–22h)
- Ca cuối tuần (8h–17h, T7–CN)
- Ca Tour dài ngày (linh hoạt)

### Loại nghỉ phép (8 loại, theo Luật Lao động VN)
Nghỉ phép năm (12 ngày/năm, có lương), Nghỉ ốm, Nghỉ thai sản (180 ngày),
Nghỉ kết hôn (3 ngày), Nghỉ tang (3 ngày), **Nghỉ bù Tour/Lễ** (đặc thù du lịch),
Nghỉ không lương, Nghỉ chăm sóc con ốm

## Deploy Production

```bash
# SSH vào server, chạy deploy script (tự detect Django vs PWA thay đổi)
ssh -i "D:/HNH2026/Cloud/naquan.pem" naquan@100.88.75.106
sudo /opt/horilla/deploy.sh
```

Script `/opt/horilla/deploy.sh` tự động:
1. `git pull` — lấy code mới
2. So sánh files thay đổi: `pwa/frontend/` → rebuild pwa; file Django → rebuild web; `pwa/bff/` → rebuild bff
3. `docker compose up -d` + `manage.py migrate`

**Lưu ý**: Phải `git push origin horilla_aqv10` trên máy local **trước** khi SSH vào chạy deploy.

- `.env` symlink → `.env.stage` (cần thiết cho docker-compose variable substitution)
- Site: https://qlns.hnhtravel.work (qua Cloudflare tunnel)
- 5 containers: web, db (postgres:16), redis, nginx, cloudflared

## Cập nhật bản dịch tiếng Việt

```bash
python manage.py makemessages -l vi --ignore=node_modules --ignore=venv
python manage.py compilemessages -l vi
```

Script `auto_translate.py` hỗ trợ dịch tự động các entry còn trống.

## Chạy dự án (local)

```bash
# DB: PostgreSQL tại localhost:5452, DB: horilla_main
python manage.py migrate
python manage.py setup_hnh_company
python manage.py runserver 0.0.0.0:8000
```

## Scripts tiện ích

| Script | Mô tả |
|--------|--------|
| `setup_new_companies.py` | Tạo dữ liệu công ty HNH |
| `sim_attendance_may.py` | Giả lập chấm công tháng 5/2026 (test data) |

## Lưu ý khi phát triển

- Không commit file `.env`, `.env.stage`, `logs_note/` (chứa secrets)
- Migrations mới phải test trên DB staging trước khi deploy production
- Khi thêm module mới vào `SIDEBARS` trong `horilla_apps.py`, cần reload server
- Logo công ty upload qua **Admin > Base > Companies** (field `icon`), lưu tại `media/base/`

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke context-save
- Code quality, health check → invoke health
