import type { FastifyInstance } from "fastify";
import { request as fetch } from "undici";
import { env } from "./env.js";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "./pkce.js";
import { createSession, getSession, destroySession } from "./session.js";

const COOKIE_NAME = "hnh_sid";
const COOKIE_OPTS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.BFF_ORIGIN.startsWith("https"),
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

export async function authRoutes(app: FastifyInstance) {
  // Step 1: Redirect to Keycloak authorization endpoint with PKCE
  app.get("/bff/auth/login", async (req, reply) => {
    const { sessionId, session } = createSession();
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const state = generateState();

    session.codeVerifier = verifier;
    session.oauthState = state;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.KC_CLIENT_ID,
      redirect_uri: `${env.BFF_ORIGIN}/bff/auth/callback`,
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    reply.setCookie(COOKIE_NAME, sessionId, COOKIE_OPTS);
    return reply.redirect(`${env.KC_BASE}/protocol/openid-connect/auth?${params}`);
  });

  // Step 2: Handle Keycloak callback, exchange code for tokens
  app.get("/bff/auth/callback", async (req, reply) => {
    const loginUrl = (err?: string) =>
      `${env.PWA_PATH}login${err ? `?error=${encodeURIComponent(err)}` : ""}`;

    try {
      const { code, state } = req.query as { code?: string; state?: string };
      const sessionId = req.cookies[COOKIE_NAME];

      if (!sessionId || !code) {
        return reply.redirect(loginUrl("session_expired"));
      }

      const session = getSession(sessionId);
      if (!session || session.oauthState !== state) {
        reply.clearCookie(COOKIE_NAME, { path: "/" });
        return reply.redirect(loginUrl("session_expired"));
      }

      // Exchange authorization code for Keycloak tokens
      const tokenRes = await fetch(`${env.KC_BASE}/protocol/openid-connect/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: env.KC_CLIENT_ID,
          code,
          redirect_uri: `${env.BFF_ORIGIN}/bff/auth/callback`,
          code_verifier: session.codeVerifier!,
        }).toString(),
      });

      if (tokenRes.statusCode !== 200) {
        const body = await tokenRes.body.text();
        app.log.error({ status: tokenRes.statusCode, body }, "KC token exchange failed");
        return reply.redirect(loginUrl("token_failed"));
      }

      const kcTokens = (await tokenRes.body.json()) as {
        access_token: string;
        refresh_token?: string;
      };

      session.kcAccessToken = kcTokens.access_token;
      session.kcRefreshToken = kcTokens.refresh_token;
      delete session.codeVerifier;
      delete session.oauthState;

      // Exchange KC access_token for Horilla SimpleJWT via /api/auth/oidc-login/
      const horillaRes = await fetch(`${env.HORILLA_API}/api/auth/oidc-login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: kcTokens.access_token }),
      });

      if (horillaRes.statusCode !== 200) {
        const body = await horillaRes.body.text();
        app.log.error({ status: horillaRes.statusCode, body }, "Horilla OIDC login failed");
        return reply.redirect(loginUrl("login_failed"));
      }

      const horillaData = (await horillaRes.body.json()) as { access: string };
      session.horillaJwt = horillaData.access;

      return reply.redirect(env.PWA_PATH);
    } catch (err) {
      app.log.error(err, "Unexpected error in auth callback");
      return reply.redirect(loginUrl("server_error"));
    }
  });

  // Logout: destroy session, redirect to Keycloak logout
  app.get("/bff/auth/logout", async (req, reply) => {
    const sessionId = req.cookies[COOKIE_NAME];
    if (sessionId) {
      destroySession(sessionId);
    }
    reply.clearCookie(COOKIE_NAME, { path: "/" });

    const params = new URLSearchParams({
      client_id: env.KC_CLIENT_ID,
      post_logout_redirect_uri: env.BFF_ORIGIN,
    });
    return reply.redirect(
      `${env.KC_BASE}/protocol/openid-connect/logout?${params}`
    );
  });

  // /bff/auth/me — return current user info (frontend polls this)
  app.get("/bff/auth/me", async (req, reply) => {
    const sessionId = req.cookies[COOKIE_NAME];
    if (!sessionId) return reply.status(401).send({ authenticated: false });

    const session = getSession(sessionId);
    if (!session?.horillaJwt) return reply.status(401).send({ authenticated: false });

    // Proxy to /api/employee/me/ with the stored JWT
    const res = await fetch(`${env.HORILLA_API}/api/employee/me/`, {
      headers: { Authorization: `Bearer ${session.horillaJwt}` },
    });

    if (res.statusCode === 401) {
      destroySession(sessionId);
      reply.clearCookie(COOKIE_NAME, { path: "/" });
      return reply.status(401).send({ authenticated: false });
    }

    const data = await res.body.json();
    return reply.send({ authenticated: true, employee: data });
  });
}
