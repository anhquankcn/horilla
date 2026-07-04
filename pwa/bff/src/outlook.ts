import type { FastifyInstance } from "fastify";
import { request as fetch } from "undici";
import { env } from "./env.js";
import { getSession } from "./session.js";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "./pkce.js";

// Tích hợp lịch Outlook (Cách B — OAuth riêng, KHÔNG đụng luồng đăng nhập chung).
// User bấm "Kết nối Outlook" → consent riêng cho Calendars.Read → BFF giữ
// refresh_token trong session → đọc lịch qua Microsoft Graph.

const COOKIE_NAME = "hnh_sid";
const AUTHORITY = () => `https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0`;
const GRAPH_SCOPES = "openid offline_access https://graph.microsoft.com/Calendars.Read";

function configured(): boolean {
  return !!(env.MS_CLIENT_ID && env.MS_CLIENT_SECRET);
}

async function getAccessToken(session: {
  msRefreshToken?: string; msAccessToken?: string; msExpiresAt?: number;
}): Promise<string | null> {
  // Còn hạn thì dùng lại (chừa 60s).
  if (session.msAccessToken && session.msExpiresAt && session.msExpiresAt - 60_000 > Date.now()) {
    return session.msAccessToken;
  }
  if (!session.msRefreshToken) return null;
  const res = await fetch(`${AUTHORITY()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: session.msRefreshToken,
      scope: GRAPH_SCOPES,
    }).toString(),
  });
  if (res.statusCode !== 200) return null;
  const t = (await res.body.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  session.msAccessToken = t.access_token;
  session.msExpiresAt = Date.now() + t.expires_in * 1000;
  if (t.refresh_token) session.msRefreshToken = t.refresh_token;
  return t.access_token;
}

// ── Persist refresh_token ở DB Django (sống qua BFF restart) ──────────────────
// BFF gọi API Django bằng JWT của chính user; Django lưu MÃ HOÁ.
async function djangoLoadToken(jwt: string): Promise<string | null> {
  try {
    const r = await fetch(`${env.HORILLA_API}/api/calendar/outlook-token/`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (r.statusCode !== 200) return null;
    const d = (await r.body.json()) as { connected: boolean; refresh_token: string | null };
    return d.refresh_token ?? null;
  } catch {
    return null;
  }
}

async function djangoSaveToken(jwt: string, refreshToken: string): Promise<void> {
  try {
    await fetch(`${env.HORILLA_API}/api/calendar/outlook-token/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch { /* không chặn luồng nếu persist lỗi */ }
}

async function djangoDeleteToken(jwt: string): Promise<void> {
  try {
    await fetch(`${env.HORILLA_API}/api/calendar/outlook-token/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${jwt}` },
    });
  } catch { /* bỏ qua */ }
}

// Nạp refresh_token từ DB vào session nếu session trống (sau BFF restart).
async function ensureRefreshToken(session: { msRefreshToken?: string; horillaJwt?: string }): Promise<void> {
  if (session.msRefreshToken || !session.horillaJwt) return;
  const rt = await djangoLoadToken(session.horillaJwt);
  if (rt) session.msRefreshToken = rt;
}

export async function outlookRoutes(app: FastifyInstance) {
  // Bắt đầu kết nối: chuyển hướng tới Microsoft consent.
  app.get("/bff/outlook/connect", async (req, reply) => {
    if (!configured()) return reply.status(503).send("Outlook chưa được cấu hình trên máy chủ");
    const sessionId = req.cookies[COOKIE_NAME];
    const session = sessionId ? getSession(sessionId) : undefined;
    if (!session) return reply.redirect(`${env.PWA_PATH}login`);

    const verifier = generateCodeVerifier();
    session.msVerifier = verifier;
    session.msState = generateState();
    const params = new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      response_type: "code",
      redirect_uri: env.MS_REDIRECT_URI,
      response_mode: "query",
      scope: GRAPH_SCOPES,
      state: session.msState,
      code_challenge: generateCodeChallenge(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return reply.redirect(`${AUTHORITY()}/authorize?${params}`);
  });

  // Callback: đổi code lấy token, lưu refresh_token, quay về màn Lịch.
  app.get("/bff/outlook/callback", async (req, reply) => {
    const back = (q: string) => reply.redirect(`${env.PWA_PATH}outlook${q}`);
    const { code, state } = req.query as { code?: string; state?: string };
    const sessionId = req.cookies[COOKIE_NAME];
    const session = sessionId ? getSession(sessionId) : undefined;
    if (!session || !code || !state || state !== session.msState) return back("?outlook=error");
    try {
      const res = await fetch(`${AUTHORITY()}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.MS_CLIENT_ID,
          client_secret: env.MS_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: env.MS_REDIRECT_URI,
          code_verifier: session.msVerifier ?? "",
          scope: GRAPH_SCOPES,
        }).toString(),
      });
      if (res.statusCode !== 200) {
        app.log.error({ status: res.statusCode }, "Outlook token exchange failed");
        return back("?outlook=error");
      }
      const t = (await res.body.json()) as { access_token: string; refresh_token?: string; expires_in: number };
      session.msAccessToken = t.access_token;
      session.msExpiresAt = Date.now() + t.expires_in * 1000;
      session.msRefreshToken = t.refresh_token;
      delete session.msVerifier; delete session.msState;
      // Persist refresh_token vào DB để sống qua BFF restart.
      if (t.refresh_token && session.horillaJwt) {
        await djangoSaveToken(session.horillaJwt, t.refresh_token);
      }
      return back("?outlook=connected");
    } catch (err) {
      app.log.error(err, "Outlook callback error");
      return back("?outlook=error");
    }
  });

  // Trạng thái kết nối.
  app.get("/bff/outlook/status", async (req, reply) => {
    const sessionId = req.cookies[COOKIE_NAME];
    const session = sessionId ? getSession(sessionId) : undefined;
    if (session) await ensureRefreshToken(session);   // khôi phục sau restart
    return reply.send({ configured: configured(), connected: !!session?.msRefreshToken });
  });

  // Ngắt kết nối.
  app.post("/bff/outlook/disconnect", async (req, reply) => {
    const sessionId = req.cookies[COOKIE_NAME];
    const session = sessionId ? getSession(sessionId) : undefined;
    if (session) {
      if (session.horillaJwt) await djangoDeleteToken(session.horillaJwt);
      delete session.msRefreshToken; delete session.msAccessToken; delete session.msExpiresAt;
    }
    return reply.send({ connected: false });
  });

  // Sự kiện lịch Outlook trong khoảng [from, to].
  app.get("/bff/api/calendar/outlook", async (req, reply) => {
    const sessionId = req.cookies[COOKIE_NAME];
    const session = sessionId ? getSession(sessionId) : undefined;
    if (!session?.horillaJwt) return reply.status(401).send({ error: "Not authenticated" });
    if (!configured()) return reply.status(503).send({ error: "not_configured", events: [] });
    await ensureRefreshToken(session);   // khôi phục refresh_token từ DB sau restart
    if (!session.msRefreshToken) return reply.send({ connected: false, events: [] });

    const token = await getAccessToken(session);
    if (!token) return reply.send({ connected: false, events: [] });

    const { from, to } = req.query as { from?: string; to?: string };
    const start = from ? `${from}T00:00:00` : new Date().toISOString().slice(0, 10) + "T00:00:00";
    const end = to ? `${to}T23:59:59` : start;
    const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(start)}`
      + `&endDateTime=${encodeURIComponent(end)}`
      + `&$select=subject,start,end,isAllDay,location,showAs,isCancelled,responseStatus`
      + `&$top=200&$orderby=start/dateTime`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="Asia/Ho_Chi_Minh"' },
    });
    if (res.statusCode !== 200) {
      app.log.warn({ status: res.statusCode }, "Graph calendarView failed");
      return reply.send({ connected: true, events: [] });
    }
    const data = (await res.body.json()) as { value: Array<Record<string, any>> };
    const events = (data.value ?? []).map((e) => {
      // Trạng thái cuộc họp: đã hủy / đã confirm / dự kiến.
      const resp = e.responseStatus?.response as string | undefined;
      const status = e.isCancelled || resp === "declined"
        ? "cancelled"
        : resp === "accepted" || resp === "organizer"
          ? "confirmed"
          : "tentative";
      return {
        id: `outlook-${e.id ?? Math.random().toString(36).slice(2)}`,
        kind: "outlook",
        title: e.subject || "(Không tiêu đề)",
        start: (e.start?.dateTime ?? "").slice(0, 10),
        end: (e.end?.dateTime ?? "").slice(0, 10),
        all_day: !!e.isAllDay,
        description: e.location?.displayName || "",
        source: "outlook",
        status,
        show_as: e.showAs || "",
        start_time: e.isAllDay ? null : (e.start?.dateTime ?? "").slice(11, 16),
        end_time: e.isAllDay ? null : (e.end?.dateTime ?? "").slice(11, 16),
      };
    });
    return reply.send({ connected: true, events });
  });
}
