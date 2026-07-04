import { randomBytes } from "node:crypto";

interface Session {
  horillaJwt?: string;
  kcAccessToken?: string;
  kcRefreshToken?: string;
  kcIdToken?: string;
  codeVerifier?: string;
  oauthState?: string;
  // Microsoft Graph (đọc lịch Outlook — Cách B). Lưu refresh_token để đọc lịch
  // lâu dài; access_token cache tới msExpiresAt. Mất khi BFF restart → user bấm
  // "Kết nối Outlook" lại (tech debt: chưa lưu DB).
  msRefreshToken?: string;
  msAccessToken?: string;
  msExpiresAt?: number;
  msVerifier?: string;
  msState?: string;
}

const store = new Map<string, Session>();

export function createSession(): { sessionId: string; session: Session } {
  const sessionId = randomBytes(24).toString("base64url");
  const session: Session = {};
  store.set(sessionId, session);
  return { sessionId, session };
}

export function getSession(sessionId: string): Session | undefined {
  return store.get(sessionId);
}

export function destroySession(sessionId: string): void {
  store.delete(sessionId);
}
