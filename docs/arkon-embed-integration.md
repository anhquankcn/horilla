# Tích hợp Arkon AI — SSO Handoff Embed

> Hướng dẫn nhúng Arkon AI PWA vào hệ thống bên ngoài qua iframe, đảm bảo đúng user
> đang đăng nhập (không lệ thuộc phiên Keycloak trình duyệt).

## Tổng quan

Arkon cấp **JWT riêng cho phiên nhúng**, gắn đúng user hệ thống gọi. Flow gồm 3 bước:

```
Hệ thống BFF (server)          Hệ thống Frontend           Arkon (iframe)
       │                              │                          │
       │ 1. POST /api/m2m/embed/session                          │
       │    (qua Tailscale)            │                          │
       │◄─── { url, ticket, 120s } ────│                          │
       │                              │                          │
       │         trả url cho FE ──────►│                          │
       │                              │ 2. <iframe src={url} />   │
       │                              │─────────────────────────►│
       │                              │                          │ 3. Exchange ticket → JWT
       │                              │                          │ 4. Vào /pwa đúng user
```

## Yêu cầu

| Mục | Chi tiết |
|-----|---------|
| Mạng | Gọi M2M qua **Tailscale** (IP tailnet) — gateway public sẽ reject |
| Service account | Tạo trên Arkon admin → Service Accounts, scope `embed:login` |
| Token format | `ark_sa_...` — dùng header `X-Arkon-Service-Token` |
| Ticket | Ngẫu nhiên 32 byte, TTL **120 giây**, dùng **đúng 1 lần** |

## Bước 1 — Server gọi Arkon M2M lấy ticket

```
POST http://<ARKON_TAILSCALE_IP>:5166/api/m2m/embed/session
```

**Header:**
```
Content-Type: application/json
X-Arkon-Service-Token: ark_sa_...
```

**Body:**
```json
{
  "email": "user@company.com",
  "name": "Nguyễn Văn A",
  "to": "/pwa"
}
```

| Field | Bắt buộc | Mô tả |
|-------|----------|-------|
| `email` | Có | Email user — Arkon map/tạo Employee theo email |
| `name` | Không | Tên hiển thị, dùng khi Employee chưa tồn tại |
| `to` | Không | Trang đích trong PWA, mặc định `/pwa`. Chấp nhận prefix `/pwa` (vd `/pwa/chat`) |

**Response 200:**
```json
{
  "url": "https://arkon.hnhtravel.work/embed-entry?ticket=AbC...",
  "ticket": "AbC...",
  "expires_in": 120,
  "employee": {
    "id": "uuid",
    "email": "user@company.com",
    "name": "Nguyễn Văn A"
  }
}
```

## Bước 2 — Frontend đặt iframe

```html
<iframe
  src="https://arkon.hnhtravel.work/embed-entry?ticket=AbC..."
  allow="clipboard-write; fullscreen; microphone"
  style="width:100%; height:100%; border:0"
/>
```

Arkon tự xử lý bước 3-4: exchange ticket → JWT → vào `/pwa` đúng user.

## Lưu ý quan trọng

### Sai port / sai network = reject ngay

| Sai | Lỗi nhận được |
|-----|---------------|
| Gọi qua public gateway (không Tailscale) | `403 Nguồn gọi không nằm trong dải mạng cho phép` |
| Sai port (vd 3001 thay vì 5166) | `401 Unauthorized` hoặc `401 Invalid API key` |
| Dùng `Authorization: Bearer` thay vì `X-Arkon-Service-Token` | `401 Invalid API key` |

### Ticket chỉ dùng 1 lần

- Gọi bước 1 **mỗi lần** mở iframe hoặc đổi user
- **Không cache** URL — ticket hết hạn sau 120s và bị xóa sau lần dùng đầu tiên
- Nếu iframe load chậm quá 120s → ticket hết hạn → cần gọi lại bước 1

### JWT iframe sống 24h

- Sau khi exchange, JWT trong iframe sống 24h
- Muốn đảm bảo danh tính luôn đúng → handoff lại mỗi lần khung được mở
- Trang `/embed-entry` xóa token cũ trước khi nạp user mới

## Ví dụ triển khai — QLNS HNH (Horilla HRM)

### Kiến trúc

```
PWA React ──GET /bff/arkon/embed-url──► BFF Fastify ──POST M2M──► Arkon (Tailscale)
                                              │
                                        Lấy email user từ
                                        Horilla /api/employee/me/
```

### BFF endpoint (Fastify)

```typescript
// GET /bff/arkon/embed-url?to=/pwa
app.get("/bff/arkon/embed-url", async (req, reply) => {
  // 1. Xác thực user QLNS qua session cookie
  const session = getSession(req.cookies.hnh_sid);
  if (!session?.horillaJwt) return reply.status(401).send({});

  // 2. Lấy email user hiện tại
  const me = await fetch(`${HORILLA_API}/api/employee/me/`, {
    headers: { Authorization: `Bearer ${session.horillaJwt}` },
  });
  const { email, employee_first_name, employee_last_name } = await me.json();

  // 3. Gọi Arkon M2M qua Tailscale
  const res = await fetch(`${ARKON_BFF_URL}/api/m2m/embed/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Arkon-Service-Token": ARKON_SERVICE_TOKEN,
    },
    body: JSON.stringify({
      email,
      name: `${employee_first_name} ${employee_last_name}`,
      to: req.query.to || "/pwa",
    }),
  });

  const { url, expires_in } = await res.json();
  return reply.send({ url, expires_in });
});
```

### Frontend (React)

```tsx
function RubyPage() {
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  useEffect(() => {
    api.get("/arkon/embed-url?to=/pwa")
      .then(data => setIframeUrl(data.url))
      .catch(() => setError("Không thể kết nối"));
  }, []);

  return iframeUrl
    ? <iframe src={iframeUrl} allow="clipboard-write" style={{width:'100%',height:'100%',border:0}} />
    : <LoadingSpinner />;
}
```

### Cấu hình Docker

```yaml
# docker-compose.stage.yml
bff:
  environment:
    ARKON_BFF_URL: http://100.81.191.29:5166    # Tailscale IP:port
    ARKON_SERVICE_TOKEN: ${ARKON_SERVICE_TOKEN}  # từ .env.stage
```

```env
# .env.stage
ARKON_SERVICE_TOKEN=ark_sa_...
ARKON_BFF_URL=http://100.81.191.29:5166
```

## Debug checklist

Khi gặp lỗi, kiểm tra theo thứ tự:

1. **BFF container có env đúng không?**
   ```bash
   docker exec <bff-container> printenv ARKON_SERVICE_TOKEN
   docker exec <bff-container> printenv ARKON_BFF_URL
   ```

2. **Tailscale reachable?**
   ```bash
   curl -s http://100.81.191.29:5166/health
   ```

3. **Token hợp lệ?**
   ```bash
   curl -X POST http://100.81.191.29:5166/api/m2m/embed/session \
     -H "Content-Type: application/json" \
     -H "X-Arkon-Service-Token: ark_sa_..." \
     -d '{"email":"test@company.com","name":"Test"}'
   ```
   - 200 → OK
   - 401 `Unauthorized` → token sai hoặc scope thiếu
   - 403 `Tailscale` → không gọi qua Tailscale

4. **Frontend gọi đúng path?**
   - `api.get("/arkon/embed-url")` — KHÔNG thêm `/bff` (api helper tự thêm prefix)

5. **Sau khi đổi token/URL** → restart BFF container (env chỉ load lúc start)

## Tài liệu gốc

- Spec từ Arkon: `github.com/anhquankcn/arkon/blob/main/docs/QLNS-EMBED-SSO-HANDOFF.md`
- Arkon admin: Service Accounts → tạo token với scope `embed:login`
