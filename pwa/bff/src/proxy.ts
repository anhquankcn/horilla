import type { FastifyInstance } from "fastify";
import { request as fetch } from "undici";
import { env } from "./env.js";
import { getSession, destroySession } from "./session.js";

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

    const res = await fetch(targetUrl, {
      method: req.method as any,
      headers,
      body: bodyToSend,
    });

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

  // Arkon embed SSO handoff — get one-time ticket URL
  // Reads Arkon config from IntegrationConfig DB (tab Tích hợp), fallback to env
  app.get("/bff/arkon/embed-url", async (req, reply) => {
    const sessionId = req.cookies[COOKIE_NAME];
    if (!sessionId) return reply.status(401).send({ error: "Not authenticated" });
    const session = getSession(sessionId);
    if (!session?.horillaJwt) return reply.status(401).send({ error: "Not authenticated" });

    // 1. Get Arkon config from DB (via Django internal endpoint)
    let arkonToken = env.ARKON_SERVICE_TOKEN;
    let arkonUrl = env.ARKON_BFF_URL;

    try {
      const cfgRes = await fetch(`${env.HORILLA_API}/api/m2m/integrations/arkon/internal/`, {
        headers: { Authorization: `Bearer ${session.horillaJwt}` },
      });
      if (cfgRes.statusCode === 200) {
        const cfg = await cfgRes.body.json() as { token: string; base_url: string; enabled: boolean };
        if (cfg.token) arkonToken = cfg.token;
        if (cfg.base_url) arkonUrl = cfg.base_url;
      }
    } catch {
      // fallback to env vars
    }

    if (!arkonToken) {
      return reply.status(500).send({ error: "Arkon chưa được cấu hình token (tab Tích hợp)" });
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

    // 3. Request embed session from Arkon
    const arkonRes = await fetch(`${arkonUrl}/api/m2m/embed/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arkon-Service-Token": arkonToken,
      },
      body: JSON.stringify({ email, name, to }),
    });

    if (arkonRes.statusCode !== 200) {
      const text = await arkonRes.body.text();
      app.log.error(`Arkon embed session failed: ${arkonRes.statusCode} ${text}`);
      return reply.status(502).send({ error: "Arkon embed session failed" });
    }

    const data = await arkonRes.body.json() as { url: string; ticket: string; expires_in: number };
    return reply.send({ url: data.url, expires_in: data.expires_in });
  });
}
