import type { FastifyInstance } from "fastify";
import { request as fetch } from "undici";
import { env } from "./env.js";

// Route CÔNG KHAI cho feed lịch .ics: Outlook/Google/Apple refresh KHÔNG gửi
// cookie/JWT, nên endpoint này KHÔNG qua lớp auth session — xác thực bằng token
// khó đoán trong URL (validate ở Django). Chỉ proxy GET đọc, không nhận body.
export async function calendarRoutes(app: FastifyInstance) {
  app.get("/bff/calendar/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    // token có thể kèm .ics — Django tự strip. Chặn ký tự lạ (chỉ cho token-urlsafe + .ics).
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(token)) {
      return reply.status(400).send("Bad token");
    }
    const upstream = `${env.HORILLA_API}/api/calendar/feed/${encodeURIComponent(token)}`;
    const res = await fetch(upstream, { method: "GET" });
    const body = Buffer.from(await res.body.arrayBuffer());
    return reply
      .status(res.statusCode)
      .header("content-type", res.headers["content-type"] ?? "text/calendar; charset=utf-8")
      .send(body);
  });
}
