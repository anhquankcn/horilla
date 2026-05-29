import { randomBytes } from "node:crypto";

interface Session {
  horillaJwt?: string;
  kcAccessToken?: string;
  kcRefreshToken?: string;
  codeVerifier?: string;
  oauthState?: string;
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
