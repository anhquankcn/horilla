---
status: completed
branch: horilla_aqv10
timestamp: 2026-07-08T08:51:46+0700
files_modified:
  - pwa/bff/src/session.ts
  - pwa/bff/src/server.ts
  - pwa/bff/src/env.ts
  - pwa/bff/package.json
  - docker-compose.prod.yml
  - docker-compose.stage.yml
---

## Working on: BFF Redis session persistence (deployed prod)

### Summary

BFF phiên (KC token + Horilla JWT + MS tokens) trước đây chỉ nằm in-memory Map →
mỗi lần deploy/restart BFF bắt cả công ty đăng nhập lại. Đã thêm snapshot Map ra
Redis: nạp lúc khởi động, flush khi SIGTERM (deploy) + định kỳ 30s. Deploy prod
xong (commit `9d70d0b0d`), verify chạy đúng. **Xong.** Từ deploy/restart SAU trở
đi không ai phải re-login nữa (deploy hôm nay là lần re-login cuối vì container
cũ chưa có code flush).

### Decisions Made

- **Map vẫn là store chính**, Redis chỉ là snapshot 1 key `bff:sessions` (JSON
  array of [sid, session]). Giữ `getSession`/`createSession`/`destroySession`
  đồng bộ → không đụng ~20 call site. Không dùng Redis làm store trực tiếp.
- **Degrade an toàn**: Redis lỗi → BFF vẫn chạy in-memory (getRedis trả null,
  init/flush no-op). Không để Redis thành single point of failure cho login.
- **Prune phiên > 8 ngày** khi nạp lại (MAX_AGE_MS), dựa `session.createdAt`.
- **flush ngay khi destroySession** (logout bền vững, không đợi 30s).
- Bỏ `enableOfflineQueue:false` (gây throw lúc initSessions chạy trước khi Redis
  connect) → dùng `connectTimeout:3000` + `maxRetriesPerRequest:2` + retryStrategy.

### Remaining Work

Feature này ĐÃ XONG. Việc tồn (theo docs/plan-cb-leave-enhancements.md):
1. C&B Đợt 2 — #5 hủy đơn nghỉ đã duyệt khi NV vẫn đi làm (chỉ hủy, KHÔNG tự hoàn).
2. C&B Đợt 3 — #4 nhắc phê duyệt: gửi ngay + sau 3 ngày + rồi 2 lần/ngày.
3. C&B Đợt 4 — #1 cấu hình người duyệt theo phòng ban (CBLeaveManager UI).

### Notes

- **Cách test LOAD trên stage**: `docker rm -f` container bff (SIGKILL, KHÔNG
  flush) rồi `docker compose up -d bff` → log `[session] loaded N sessions from
  Redis`. KHÔNG dùng `docker restart`/`stop` để test load — nó gửi SIGTERM →
  flush ghi Map RỖNG đè key test. Lặp SIGKILL nhiều lần → Docker restart-backoff
  chặn container bật lại (dùng force-recreate/rm+up để reset).
- Verify prod: key rỗng lần đầu → initSessions `if(!blob) return` KHÔNG log
  "loaded" (im lặng, không phải lỗi). Xác nhận sống bằng `EXISTS bff:sessions`=1
  sau ~35s (autosave đã ghi).
- Deploy prod: `ssh -i ~/CloudSrv/es-hrm.pem naquan@100.99.164.24`,
  `/opt/hnh/horilla`, `docker-compose.prod.yml`. REDIS_PASSWORD đã có trong
  .env.prod (redis service dùng sẵn). Stage: naquan.pem @100.88.75.106.
- **Advisory tồn đọng**: rotate MS_CLIENT_SECRET trên Azure (đã lộ trong chat);
  onboarding nên sync Employee.is_active ↔ User.is_active (gốc lỗi login marcy);
  badge_map 6 case reconcile (reconcile_review.tsv) ở repo hnh-attendance-gateway.
- Các fix auth khác cùng đợt đã prod: kc-session auto-refresh (ce5c49d79, hết
  loop nghẽn login VP 185 LTT), weather proxy cache (b434d6b31, hết treo clock-in).
