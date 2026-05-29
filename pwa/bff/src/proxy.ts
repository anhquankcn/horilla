import type { FastifyInstance } from "fastify";
import { request as fetch } from "undici";
import { env } from "./env.js";
import { getSession, destroySession } from "./session.js";

const COOKIE_NAME = "hnh_sid";

export async function proxyRoutes(app: FastifyInstance) {
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

    const res = await fetch(targetUrl, {
      method: req.method as any,
      headers,
      body: hasBody ? JSON.stringify(req.body) : undefined,
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
}
