# Horilla HRM — Công ty Du lịch Hồng Ngọc Hà

Horilla HRM customized cho **Công ty Du lịch Hồng Ngọc Hà** (hongngocha.com).
Branch làm việc chính: `horilla_aqv10`. Merge về `1.0` khi release.

## Thông tin công ty

| Trường | Giá trị |
|--------|---------|
| Tên | Công ty Du lịch Hồng Ngọc Hà |
| Địa chỉ | 268 Tô Hiến Thành, P.15, Q.10, TP.HCM |
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
- **Logo fallback**: SVG inline "HNH" đỏ crimson (`#c0222b`) khi chưa upload logo

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

## Cập nhật bản dịch tiếng Việt

```bash
# Trích xuất chuỗi mới cần dịch
python manage.py makemessages -l vi --ignore=node_modules --ignore=venv

# Sau khi sửa horilla/locale/vi/LC_MESSAGES/django.po
python manage.py compilemessages -l vi
```

Script `auto_translate.py` hỗ trợ dịch tự động các entry còn trống.

## Chạy dự án

```bash
# DB: PostgreSQL tại localhost:5452, DB: horilla_main
python manage.py migrate
python manage.py setup_hnh_company
python manage.py runserver 0.0.0.0:8000
```

## Lưu ý khi phát triển

- Không commit file `.env` (chứa secrets OIDC, DB)
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
