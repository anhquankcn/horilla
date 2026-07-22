import { request as fetch } from "undici";
import type { FastifyInstance } from "fastify";
import { env } from "./env.js";

// Nhắc "lịch bận sắp tới" từ Outlook — báo web-push trước 15 phút.
// Vì Django KHÔNG đọc được Outlook (lịch fetch client-side qua Graph), BFF là nơi
// có sẵn MS creds + refresh_token → loop mỗi phút: lấy danh sách user cần nhắc từ
// Django (M2M), fetch Graph calendarView của từng user, tìm lịch BẬN chính thức
// (không huỷ, showAs≠free, tiêu đề không có "cancel") bắt đầu trong [15,16) phút,
// rồi gọi Django đẩy push. Dedupe theo vòng đời process.

const AUTHORITY = () => `https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0`;
const GRAPH_SCOPES = "openid offline_access https://graph.microsoft.com/Calendars.Read";

const accessCache = new Map<number, { token: string; exp: number }>();
const reminded = new Set<string>(); // `${userId}:${eventId}`

interface Target { user_id: number; refresh_token: string }

async function refreshAccess(refreshToken: string, userId: number): Promise<string | null> {
  const c = accessCache.get(userId);
  if (c && c.exp - 60_000 > Date.now()) return c.token;
  const res = await fetch(`${AUTHORITY()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: GRAPH_SCOPES,
    }).toString(),
  });
  if (res.statusCode !== 200) { accessCache.delete(userId); return null; }
  const t = (await res.body.json()) as { access_token: string; expires_in: number };
  accessCache.set(userId, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

function svc(path: string, method: string, body?: unknown) {
  return fetch(`${env.HORILLA_API}${path}`, {
    method,
    headers: {
      "X-HNH-Service-Token": env.HNH_SERVICE_TOKEN,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Giờ HH:MM theo Asia/Ho_Chi_Minh (UTC+7) từ epoch ms.
function hcmHM(epochMs: number): string {
  const d = new Date(epochMs + 7 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

async function tick(app: FastifyInstance) {
  if (!env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET || !env.HNH_SERVICE_TOKEN) return;

  let targets: Target[] = [];
  try {
    const r = await svc("/api/m2m/outlook-reminder-targets/", "GET");
    if (r.statusCode !== 200) return;
    targets = (((await r.body.json()) as { targets?: Target[] }).targets) ?? [];
  } catch { return; }
  if (!targets.length) return;

  const now = Date.now();
  const winLo = now + 15 * 60_000;   // 15 phút nữa
  const winHi = now + 16 * 60_000;   // (không tính mốc 16)
  const startIso = new Date(now).toISOString();
  const endIso = new Date(now + 20 * 60_000).toISOString();

  for (const tgt of targets) {
    try {
      const token = await refreshAccess(tgt.refresh_token, tgt.user_id);
      if (!token) continue;
      // Không dùng Prefer timezone → Graph trả dateTime theo UTC, dễ so sánh.
      const url = `https://graph.microsoft.com/v1.0/me/calendarView`
        + `?startDateTime=${encodeURIComponent(startIso)}&endDateTime=${encodeURIComponent(endIso)}`
        + `&$select=id,subject,start,isAllDay,showAs,isCancelled,responseStatus`
        + `&$top=50&$orderby=start/dateTime`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.statusCode !== 200) continue;
      const data = (await res.body.json()) as { value?: Array<Record<string, any>> };

      for (const e of data.value ?? []) {
        const id = e.id as string | undefined;
        if (!id) continue;
        const dedupeKey = `${tgt.user_id}:${id}`;
        if (reminded.has(dedupeKey)) continue;
        if (e.isCancelled) continue;
        if (e.isAllDay) continue;                       // cả ngày → không nhắc theo giờ
        const subject = String(e.subject || "").trim();
        if (/cancel/i.test(subject)) continue;          // lịch huỷ (Canceled: ...)
        const showAs = String(e.showAs || "").toLowerCase();
        if (showAs === "free") continue;                // chỉ lịch BẬN
        if (e.responseStatus?.response === "declined") continue;

        const dtStr = e.start?.dateTime as string | undefined;
        if (!dtStr) continue;
        // Graph (no Prefer) trả UTC nhưng thiếu 'Z' → thêm vào để parse đúng.
        const startMs = Date.parse(dtStr.endsWith("Z") ? dtStr : dtStr + "Z");
        if (Number.isNaN(startMs)) continue;
        if (startMs < winLo || startMs >= winHi) continue;

        reminded.add(dedupeKey);
        await svc("/api/m2m/send-meeting-push/", "POST", {
          user_id: tgt.user_id,
          title: "Nhắc lịch bận — 15 phút nữa",
          body: `${subject || "(Không tiêu đề)"} bắt đầu lúc ${hcmHM(startMs)}`,
          tag: `meet-${id}`,
          url: "/pwa/notifications",
        }).catch(() => {});
      }
    } catch (err) {
      app.log.warn({ err, user: tgt.user_id }, "meeting reminder tick error");
    }
  }

  if (reminded.size > 5000) reminded.clear();
}

export function startMeetingReminderLoop(app: FastifyInstance) {
  if (!env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET || !env.HNH_SERVICE_TOKEN) {
    app.log.info("Meeting reminder loop tắt (thiếu MS creds hoặc HNH_SERVICE_TOKEN)");
    return;
  }
  app.log.info("Meeting reminder loop bật (mỗi 60s)");
  // Chạy lệch 30s để tránh trùng nhịp với các job khác.
  setTimeout(() => {
    tick(app).catch(() => {});
    setInterval(() => { tick(app).catch(() => {}); }, 60_000);
  }, 30_000);
}
