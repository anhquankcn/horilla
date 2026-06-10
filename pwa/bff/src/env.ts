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
} as const;
