import type { FastifyInstance } from "fastify";
import { request as fetch } from "undici";
import { env } from "./env.js";
import { getSession, destroySession } from "./session.js";
import { refreshHorillaJwt } from "./tokens.js";

const COOKIE_NAME = "hnh_sid";

export async function proxyRoutes(app: FastifyInstance) {
  // Receive multipart as raw buffer — Fastify won't parse it automatically
  app.addContentTypeParser("multipart/form-data", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  // Proxy /bff/api/* → Horilla /api/* with server-side JWT
  app.all("/bff/api/*", async (req, reply) => {
    const sessionId = req.cookies[COOKIE_NAME];
    if (!sessionId) return reply.status(401).send({ error: "Not authenticated" });

    const session = getSession(sessionId);
    if (!session?.horillaJwt) {
      return reply.status(401).send({ error: "Not authenticated" });
    }

    // Strip /bff prefix → /api/...
    const upstream = req.url.replace(/^\/bff/, "");
    const targetUrl = `${env.HORILLA_API}${upstream}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.horillaJwt}`,
    };

    const contentType = req.headers["content-type"];
    if (contentType) headers["Content-Type"] = contentType;

    // Forward IP THẬT của client tới Django (để chấm công WiFi kiểm tra dải IP).
    // App đi qua BFF nên nếu không forward, Django chỉ thấy IP nội bộ của BFF.
    // CF-Connecting-IP do Cloudflare set (tin cậy); X-Forwarded-For dự phòng.
    const cfIp = req.headers["cf-connecting-ip"];
    if (typeof cfIp === "string" && cfIp) headers["CF-Connecting-IP"] = cfIp;
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff) headers["X-Forwarded-For"] = xff;

    const hasBody = req.method !== "GET" && req.method !== "HEAD";

    // For multipart, forward the raw buffer directly; otherwise re-serialize JSON
    let bodyToSend: Buffer | string | undefined;
    if (hasBody) {
      if (contentType?.startsWith("multipart/form-data")) {
        bodyToSend = req.body as Buffer;
      } else if (req.body !== undefined && req.body !== null) {
        bodyToSend = JSON.stringify(req.body);
      }
    }

    let res = await fetch(targetUrl, {
      method: req.method as any,
      headers,
      body: bodyToSend,
    });

    // Horilla JWT hết hạn (SimpleJWT mặc định 5 phút) → KHÔNG đá user ra ngay.
    // Thử refresh JWT bằng phiên KC còn hạn rồi gọi lại. Chỉ huỷ phiên khi
    // refresh thất bại (phiên KC cũng đã hết). Đây là chỗ user bị "đăng nhập
    // 1 lúc lại bị out" khi đang dùng app.
    if (res.statusCode === 401) {
      const ok = await refreshHorillaJwt(session);
      if (ok && session.horillaJwt) {
        headers.Authorization = `Bearer ${session.horillaJwt}`;
        res = await fetch(targetUrl, {
          method: req.method as any,
          headers,
          body: bodyToSend,
        });
      }
    }

    if (res.statusCode === 401) {
      destroySession(sessionId);
      reply.clearCookie(COOKIE_NAME, { path: "/" });
      return reply.status(401).send({ error: "Session expired" });
    }

    const responseContentType = res.headers["content-type"] ?? "application/json";
    const body = await res.body.arrayBuffer();

    return reply
      .status(res.statusCode)
      .header("content-type", responseContentType)
      .send(Buffer.from(body));
  });

  // Generic SSO handoff embed — works for ANY system in IntegrationConfig
  // Pattern: read token+base_url from DB → call {base_url}/api/m2m/embed/session
  // Usage: GET /bff/embed/{system}/url?to=/pwa
  //   system = arkon | eoffice | 1stopshop | iam | appvmb
  app.get("/bff/embed/:system/url", async (req, reply) => {
    const sessionId = req.cookies[COOKIE_NAME];
    if (!sessionId) return reply.status(401).send({ error: "Not authenticated" });
    const session = getSession(sessionId);
    if (!session?.horillaJwt) return reply.status(401).send({ error: "Not authenticated" });

    const system = (req.params as any).system as string;

    // Token header name per system (default X-{System}-Service-Token)
    const TOKEN_HEADERS: Record<string, string> = {
      arkon: "X-Arkon-Service-Token",
      eoffice: "X-EOffice-Service-Token",
      "1stopshop": "X-1SS-Service-Token",
      iam: "X-IAM-Service-Token",
      appvmb: "X-AppVMB-Service-Token",
    };

    // 1. Get config from IntegrationConfig DB
    let sysToken = "";
    let sysUrl = "";

    // Fallback to env for Arkon (backward compat)
    if (system === "arkon") {
      sysToken = env.ARKON_SERVICE_TOKEN;
      sysUrl = env.ARKON_BFF_URL;
    }

    try {
      const cfgRes = await fetch(`${env.HORILLA_API}/api/m2m/integrations/${system}/internal/`, {
        headers: { Authorization: `Bearer ${session.horillaJwt}` },
      });
      if (cfgRes.statusCode === 200) {
        const cfg = await cfgRes.body.json() as { token: string; base_url: string; enabled: boolean };
        if (cfg.token) sysToken = cfg.token;
        if (cfg.base_url) sysUrl = cfg.base_url;
      }
    } catch {
      // fallback
    }

    if (!sysToken || !sysUrl) {
      return reply.status(500).send({ error: `${system} chưa được cấu hình token/URL (Quản trị HT → Tích hợp)` });
    }

    // 2. Get current user info
    const meRes = await fetch(`${env.HORILLA_API}/api/employee/me/`, {
      headers: { Authorization: `Bearer ${session.horillaJwt}` },
    });
    if (meRes.statusCode !== 200) {
      return reply.status(401).send({ error: "Cannot fetch user info" });
    }
    const me = await meRes.body.json() as { email?: string; employee_first_name?: string; employee_last_name?: string };
    const email = me.email;
    if (!email) return reply.status(400).send({ error: "User has no email" });
    const name = [me.employee_first_name, me.employee_last_name].filter(Boolean).join(" ") || email;

    const to = (req.query as any).to || "/pwa";
    const headerName = TOKEN_HEADERS[system] || `X-${system}-Service-Token`;

    // 3. Request embed session
    const embedRes = await fetch(`${sysUrl}/api/m2m/embed/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [headerName]: sysToken,
      },
      body: JSON.stringify({ email, name, to }),
    });

    if (embedRes.statusCode !== 200) {
      const text = await embedRes.body.text();
      app.log.error(`${system} embed session failed: ${embedRes.statusCode} ${text}`);
      return reply.status(502).send({ error: `${system} embed session failed` });
    }

    const data = await embedRes.body.json() as { url: string; ticket: string; expires_in: number };
    return reply.send({ url: data.url, expires_in: data.expires_in, system });
  });

  // Backward compat: /bff/arkon/embed-url → redirect to generic
  app.get("/bff/arkon/embed-url", async (req, reply) => {
    const to = (req.query as any).to || "/pwa";
    return reply.redirect(`/bff/embed/arkon/url?to=${encodeURIComponent(to)}`);
  });
}
