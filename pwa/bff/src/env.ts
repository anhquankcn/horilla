function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

export const env = {
  KC_BASE: process.env.KC_BASE ?? "https://sso.hnhtravel.work/realms/HNHTravel-SGN",
  KC_CLIENT_ID: process.env.KC_CLIENT_ID ?? "horilla-hrm-pwa",
  HORILLA_API: process.env.HORILLA_API ?? "http://localhost:8000",
  BFF_PORT: Number(process.env.BFF_PORT ?? 3000),
  BFF_ORIGIN: process.env.BFF_ORIGIN ?? "http://localhost:5173",
  PWA_PATH: process.env.PWA_PATH ?? "/",
  COOKIE_SECRET: process.env.COOKIE_SECRET ?? "dev-secret-change-in-production-please",
  ARKON_BFF_URL: process.env.ARKON_BFF_URL ?? "https://arkonbff.hnhtravel.work",
  ARKON_SERVICE_TOKEN: process.env.ARKON_SERVICE_TOKEN ?? "",
  // Microsoft Graph (đọc lịch Outlook — Cách B, OAuth riêng). Tính năng chỉ bật
  // khi có đủ CLIENT_ID + CLIENT_SECRET (IT cấp). Thiếu → endpoint trả 503.
  MS_TENANT_ID: process.env.MS_TENANT_ID ?? "5938771f-e4e8-4dac-8250-75f302cd4073",
  MS_CLIENT_ID: process.env.MS_CLIENT_ID ?? "",
  MS_CLIENT_SECRET: process.env.MS_CLIENT_SECRET ?? "",
  MS_REDIRECT_URI: process.env.MS_REDIRECT_URI ?? "https://qlns.hnhtravel.work/bff/outlook/callback",
  // Redis — lưu snapshot phiên để sống qua restart BFF (không bắt cả cty re-login).
  // Không kết nối được → BFF vẫn chạy in-memory (degrade an toàn).
  REDIS_HOST: process.env.REDIS_HOST ?? "redis",
  REDIS_PORT: Number(process.env.REDIS_PORT ?? 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD ?? "",
} as const;
