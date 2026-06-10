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

## HNH Life — Announcement Feed

Feature nội bộ thêm vào tab HNH Life. Thiết kế approved 2026-06-07.

### Models (notifications/models.py)
- `Announcement`: thêm `pinned = models.BooleanField(default=False)` — **migration chưa chạy**
- `AnnouncementLike`: model mới (announcement FK, user FK, created_at, unique_together) — **chưa tạo**

### API endpoints mới (horilla_api/)
| Endpoint | View | Mô tả |
|----------|------|--------|
| `GET /api/notifications/announcements/feed/` | `AnnouncementFeedView` | Feed toàn công ty, pinned first, phân trang 20/page |
| `POST /api/notifications/announcements/{pk}/like/` | `AnnouncementLikeView` | Toggle like, trả `{liked, count}` |

**Lưu ý quan trọng**: `AnnouncementFeedView` PHẢI dùng `annotate()` cho `like_count`, `my_like`, `read_count` — không được gọi `_serialize_announcement()` trong loop (N+1 queries).

Feed query qua `AnnouncementRecipient.filter(user=request.user)` — không query `Announcement` trực tiếp.

### Frontend pages (pwa/frontend/src/)
| File | Trạng thái | Mô tả |
|------|-----------|--------|
| `pages/AnnouncementHub.tsx` | ✅ Đã có | HR tool: Tạo/Gửi/Lịch sử — tại `/announcement-hub` |
| `pages/AnnouncementFeed.tsx` | ❌ Chưa có | Employee feed: pinned + like — sẽ tại `/announcements` |
| `pages/HNHLife.tsx` | ✅ Có, cần sửa | Thêm "Tin nội bộ" preview section (fetch feed?page_size=3) |

### URLs (horilla_api/api_urls/notifications/urls.py)
Thêm static paths TRƯỚC `announcements/<int:pk>/`:
```python
path("announcements/feed/", views.AnnouncementFeedView.as_view()),
path("announcements/<int:pk>/like/", views.AnnouncementLikeView.as_view()),
```

### Quyền hạn
- Chỉ `is_staff` mới được set `pinned=True` (strip silently nếu không phải staff)
- Mọi user đã auth đều có thể tạo announcement hiện tại (tech debt, chấp nhận cho MVP)

## Coding Playbook — Team AI

### Đội hình & Vai trò

| Thành viên | CLI | Vai trò | Chuyên môn |
|-----------|-----|---------|-----------|
| **Claude** (Lead) | `claude` | Dev Lead — phân việc, fix bug, coding khó, tổng hợp | Full-stack, kiến trúc, deploy |
| **GH Copilot** | `gh copilot` | Frontend developer | React/TSX, PWA pages, CSS, UI components |
| **Codex** | `codex` | Backend developer | Django views, models, migrations, API endpoints |
| **Gemini** | `gemini -p` | Code reviewer — review cùng Claude | Review logic, security, performance, best practices |

### Quy trình làm việc

```
1. Nhận yêu cầu từ anh (Product Owner)
2. Claude phân tích → chia task frontend/backend
3. Giao việc:
   - Frontend → GH Copilot (React pages, components, CSS)
   - Backend  → Codex (Django views, models, API)
   - Khó/cross-cutting → Claude tự làm
4. Thu code → Claude tổng hợp, resolve conflicts
5. Review → Gemini + Claude review song song
6. Claude fix issues từ review
7. Commit → Push → Deploy
```

### Nguyên tắc giao việc

**GH Copilot (Frontend):**
- Tạo/sửa React pages trong `pwa/frontend/src/pages/`
- UI components trong `pwa/frontend/src/components/`
- CSS/styling theo theme HNH (`lib/theme.ts`)
- PHẢI tuân thủ: HNH color palette, mobile-first, safe-area aware

**Codex (Backend):**
- Django models, views, serializers
- API endpoints trong `horilla_api/`
- Migrations — PHẢI test trước khi deploy
- Management commands
- PHẢI tuân thủ: annotate() thay vì N+1 queries, IsAuthenticated permission

**Claude (Lead — tự xử lý):**
- Cross-cutting changes (frontend + backend cùng feature)
- Fix bugs phức tạp, debug production
- Deploy, migration trên staging
- Tổng hợp code từ nhiều nguồn, resolve conflicts
- Kiến trúc mới, refactor lớn
- Viết CLAUDE.md, documentation

**Gemini (Reviewer):**
- Review mọi diff trước khi commit
- Kiểm tra: logic bugs, security (XSS, SQL injection), performance (N+1), code style
- Claude đọc feedback Gemini → quyết định fix hay skip

### Cách gọi CLI

```bash
# Giao frontend cho GH Copilot
gh copilot -- "Tạo page ExpenseRequest.tsx theo design: ..."

# Giao backend cho Codex
codex "Tạo ExpenseRequestView trong horilla_api: ..."

# Review với Gemini (non-interactive)
gemini -p "Review diff sau, tìm bugs và suggest improvements: $(git diff --staged)"

# Review file cụ thể
gemini -p "Review file này về security và performance: $(cat path/to/file.py)"
```

### Quy tắc Review

1. **Mọi code từ Copilot/Codex phải qua review** trước khi commit
2. Gemini review → Claude đọc findings → fix nếu cần
3. Claude tự review code của mình (không cần Gemini cho trivial changes)
4. **Blockers cần anh quyết định**: thay đổi DB schema, xóa feature, thay đổi auth flow

### Commit Convention

```
feat(scope): mô tả ngắn          ← feature mới
fix(scope): mô tả ngắn           ← sửa bug
refactor(scope): mô tả ngắn      ← refactor không đổi behavior
docs: mô tả ngắn                 ← documentation

scope = pwa | api | payroll | attendance | employee | ...
```

### Khi nào KHÔNG giao việc

- Sửa 1-2 dòng code → Claude tự làm, nhanh hơn
- Fix bug production khẩn cấp → Claude tự làm ngay
- Thay đổi liên quan secrets/auth/deploy → Claude tự làm
- Conflict resolution → Claude tự làm

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
