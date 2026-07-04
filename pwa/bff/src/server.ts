import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { authRoutes } from "./auth.js";
import { proxyRoutes } from "./proxy.js";
import { calendarRoutes } from "./calendar.js";

// bodyLimit 15MB: ảnh CCCD/selfie base64 (Fastify mặc định chỉ 1MB → 413).
const app = Fastify({ logger: true, bodyLimit: 15 * 1024 * 1024 });

await app.register(cookie, { secret: env.COOKIE_SECRET });
await app.register(cors, {
  origin: env.BFF_ORIGIN,
  credentials: true,
});

await app.register(authRoutes);
await app.register(calendarRoutes);
await app.register(proxyRoutes);

app.get("/bff/health", async () => ({ status: "ok" }));

await app.listen({ port: env.BFF_PORT, host: "0.0.0.0" });
app.log.info(`BFF listening on http://localhost:${env.BFF_PORT}`);
