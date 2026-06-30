import { request as fetch } from "undici";
import { env } from "./env.js";

// Phần session cần để làm mới token (cấu trúc con của Session).
export type RefreshableSession = {
  kcAccessToken?: string;
  kcRefreshToken?: string;
  kcIdToken?: string;
  horillaJwt?: string;
};

// Làm mới Horilla JWT khi nó hết hạn: dùng KC refresh_token (nếu có) lấy KC
// access_token mới rồi đổi lấy Horilla JWT mới. Trả true nếu session.horillaJwt
// được cập nhật. Nhờ đó user không bị signout giữa chừng chỉ vì JWT hết hạn
// (SimpleJWT mặc định 5 phút) trong khi phiên KC vẫn còn hiệu lực.
export async function refreshHorillaJwt(
  session: RefreshableSession
): Promise<boolean> {
  try {
    // 1) Nếu có refresh_token KC → lấy KC access_token mới.
    if (session.kcRefreshToken) {
      const tokenRes = await fetch(
        `${env.KC_BASE}/protocol/openid-connect/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: env.KC_CLIENT_ID,
            refresh_token: session.kcRefreshToken,
          }).toString(),
        }
      );
      if (tokenRes.statusCode === 200) {
        const t = (await tokenRes.body.json()) as {
          access_token: string;
          refresh_token?: string;
          id_token?: string;
        };
        session.kcAccessToken = t.access_token;
        if (t.refresh_token) session.kcRefreshToken = t.refresh_token;
        if (t.id_token) session.kcIdToken = t.id_token;
      }
    }
    if (!session.kcAccessToken) return false;

    // 2) Đổi KC access_token → Horilla JWT mới.
    const horillaRes = await fetch(`${env.HORILLA_API}/api/auth/oidc-login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: session.kcAccessToken }),
    });
    if (horillaRes.statusCode !== 200) return false;
    const data = (await horillaRes.body.json()) as { access: string };
    session.horillaJwt = data.access;
    return true;
  } catch {
    return false;
  }
}
