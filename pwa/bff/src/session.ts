import { randomBytes } from "node:crypto";
import Redis from "ioredis";
import { env } from "./env.js";

interface Session {
  createdAt?: number;   // mốc tạo (ms) — để prune phiên quá hạn khi nạp lại
  horillaJwt?: string;
  kcAccessToken?: string;
  kcRefreshToken?: string;
  kcIdToken?: string;
  codeVerifier?: string;
  oauthState?: string;
  // Microsoft Graph (đọc lịch Outlook — Cách B). refresh_token đã persist DB
  // (OutlookToken); ở đây chỉ cache access_token tới msExpiresAt.
  msRefreshToken?: string;
  msAccessToken?: string;
  msExpiresAt?: number;
  msVerifier?: string;
  msState?: string;
}

const store = new Map<string, Session>();

// ── Persist snapshot phiên ra Redis để sống qua restart BFF ─────────────────
// Giữ Map làm store chính (get/create/destroy đồng bộ, không đụng call site).
// Snapshot toàn bộ Map ra 1 key Redis: nạp lúc khởi động, ghi khi SIGTERM (deploy)
// + định kỳ. Deploy graceful → phiên còn nguyên, KHÔNG bắt cả cty đăng nhập lại.
const REDIS_KEY = "bff:sessions";
const MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000; // prune phiên > 8 ngày khi nạp

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  try {
    redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      connectTimeout: 3000,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 300, 2000)),
    });
    redis.on("error", (e) => console.error("[session] redis error:", e.message));
    return redis;
  } catch (e) {
    console.error("[session] redis init failed:", e);
    return null;
  }
}

// Nạp snapshot phiên từ Redis vào Map (gọi 1 lần lúc khởi động BFF).
export async function initSessions(): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const blob = await r.get(REDIS_KEY);
    if (!blob) return;
    const entries = JSON.parse(blob) as [string, Session][];
    const now = Date.now();
    let loaded = 0;
    for (const [sid, s] of entries) {
      if (s.createdAt && now - s.createdAt > MAX_AGE_MS) continue; // bỏ phiên quá hạn
      store.set(sid, s);
      loaded++;
    }
    console.log(`[session] loaded ${loaded} sessions from Redis`);
  } catch (e) {
    console.error("[session] load failed:", e);
  }
}

// Ghi toàn bộ Map ra Redis (gọi khi SIGTERM + định kỳ). Không ném lỗi.
export async function flushSessions(): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(REDIS_KEY, JSON.stringify(Array.from(store.entries())));
  } catch (e) {
    console.error("[session] flush failed:", e);
  }
}

let autosaveTimer: ReturnType<typeof setInterval> | null = null;
export function startSessionAutosave(intervalMs = 30_000): void {
  if (autosaveTimer) return;
  autosaveTimer = setInterval(() => { void flushSessions(); }, intervalMs);
  autosaveTimer.unref?.();
}

export function createSession(): { sessionId: string; session: Session } {
  const sessionId = randomBytes(24).toString("base64url");
  const session: Session = { createdAt: Date.now() };
  store.set(sessionId, session);
  return { sessionId, session };
}

export function getSession(sessionId: string): Session | undefined {
  return store.get(sessionId);
}

export function destroySession(sessionId: string): void {
  store.delete(sessionId);
  void flushSessions(); // logout bền vững ngay (không đợi định kỳ)
}
