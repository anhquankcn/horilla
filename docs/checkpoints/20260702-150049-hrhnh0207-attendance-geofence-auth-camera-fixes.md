---
status: completed
branch: horilla_aqv10
timestamp: 2026-07-02T15:00:49+0700
files_modified: []
---

## Working on: HRHNH0207 — loạt fix attendance/geofence/auth/camera + data công ty Beyond (prod)

### Summary

Phiên HR/HNH ngày 26/06→02/07: chuỗi fix production cho HRM (chấm công GPS, hiển
thị Trong/Ngoài VP, đăng nhập KC/BFF, camera fallback) + thêm công ty **Beyond**
và gán nhân sự. Tất cả đã deploy prod + validate, working tree sạch, HEAD
`6d3f7870c` trên `horilla_aqv10`. Mọi thay đổi đều theo quy trình: chẩn đoán →
fix → stage → validate → chờ "ok prod" → prod. KHÔNG có migration nào trong loạt này.

### Decisions Made

- **Geofence = nguồn sự thật cho work_location** (`4705cb458`): server override
  in_office→out_of_office khi GPS ngoài bán kính; detail view tính lại per-leg.
- **Hiển thị Trong/Ngoài VP + khoảng cách theo TỪNG lượt** (`3b780edbf`): bug gốc
  = `flattenPunches` gán chung work_location cho cả vào+ra. Backend trả
  `clock_in_inside/clock_out_inside` + `_distance_m`; FE helper `legInside`/`fmtDistance`.
- **Card "Tuần này" lệch cột** (`ab622120a`): `toISOString()` (UTC) làm lệch ngày ở
  UTC+7. Thêm helper `ymd()` format local. Chỉ Attendance.tsx bị.
- **Geofence ĐA VĂN PHÒNG** (`be56fd834`): `check_geofence` BỎ QUA tham số company,
  coi "trong VP" nếu nằm trong BẤT KỲ GeoFencing start=True nào. Không đổi model
  (OneToOne giữ nguyên). Vemaybay (43 Thủ Khoa Huân) đã là Company 2 sẵn.
- **Auth chống signout** (`24e7067c3` + `3819726d4`): gốc rễ = Horilla JWT hết hạn
  (~5') → BFF đá session, FE không refresh. Fix: `/bff/auth/me` + proxy `/bff/api/*`
  tự `refreshHorillaJwt()` (KC refresh_token→JWT mới) trước khi huỷ. Login.tsx thêm
  loading khi bấm (chống tap lặp) + tự fallback KC 1 lần khi lỗi tạm thời. Helper
  tách sang `pwa/bff/src/tokens.ts`.
- **Trang login KC tiếng Việt + branding HNH** (01/07): KC 26.2.5 KHÔNG có locale vi.
  (1) realm localization override (en) dịch message lỗi; (2) custom theme `hnh`
  (`/opt/hnh/sso/themes/hnh/login/`, loginTheme=hnh) logo + đỏ #c0222b.
- **Camera fallback CHẶT** (`6d3f7870c`): camera hỏng → nút "Camera lỗi — chấm không
  ảnh" CHỈ khi trong VP; server bắt buộc GPS trong VP + luôn attendance_validated=False
  (HR duyệt) + badge "⚠ Không ảnh". Desktop vẫn cấm. Tầng giảm lỗi: video.play()
  bọc .catch (iOS PWA autoplay).
- **Company Beyond** (data prod, id=8): 268 Cô Bắc, P.Cầu Ông Lãnh, Q1, toạ độ
  `10.763051,106.692369`, geofence 200m active. Phòng "Phòng Vé Beyond" (id=45).
  Gán 7 NV email @beyondtravel.vn (BYT0001-0009) → company=Beyond + phòng đó.

### Remaining Work

Không còn việc code treo. Các việc CHỜ PHÍA ANH/HR/IT (ngoài code):
1. Bảo mật cũ: rotate + scrub `hnh_repl_2026_secure` trong git history (BFG) — treo từ lâu.
2. KC SSO Session Idle/Max = 24h → muốn giảm signout qua đêm thì chỉnh realm KC.
3. Tài khoản KC chưa có User Horilla khớp (vu.pc, visa02/03, nam.dx...) → HR tạo
   (username/email = <...>@hongngocha.com, is_active=True). Có thể audit hàng loạt nếu cần.
4. Chống chấm hộ nâng cao (tùy chọn, chưa làm): 1 user↔1 device, hoặc face-match selfie.
5. Báo cáo bất thường chấm công đã gửi anh (nhóm GPS rác/sát ranh/cần HR rà).

### Notes

**Deploy đã có bẫy CHÍ MẠNG (đã ghi memory):** Keycloak deploy RIÊNG tại
`/opt/hnh/sso/docker-compose.sso.yml`, env ở file `.env.sso` (KHÔNG phải .env) →
recreate PHẢI `docker compose --env-file .env.sso -f docker-compose.sso.yml up -d`.
Quên → KC crash-loop → LOGIN TOÀN CTY DOWN (đã xảy ra ~1-2' lúc gắn theme, đã khắc phục).

**Hạ tầng:** prod 100.99.164.24 (`/opt/hnh/horilla`, docker-compose.prod.yml, key
es-hrm.pem, user naquan), stage 100.88.75.106 (`/opt/horilla`, key naquan.pem). Cả 2
branch horilla_aqv10. Web-only fix = rebuild `web`; đụng pwa/frontend = build+no-cache
`pwa`; đụng pwa/bff = build `bff`.

**KC ops:** `sudo docker exec HNHSSO ...kcadm.sh` dùng `$KC_BOOTSTRAP_ADMIN_USERNAME/PASSWORD`
từ env container (không in secret). Classifier chặn đọc secret + ghi data prod chưa nêu
đích danh — cần user duyệt/nêu rõ bản ghi.

**Memory đã cập nhật đầy đủ:** horilla-clock-diagnostics (geofence đa VP, camera
fallback, work_location per-leg), horilla-auth-flow (BFF refresh, KC login VN theme),
horilla-deploy-topology (bẫy .env.sso KC). MEMORY.md có index.

**Commit phiên này (7):** 4705cb458, 3b780edbf, ab622120a, be56fd834, 24e7067c3,
3819726d4, 6d3f7870c.
