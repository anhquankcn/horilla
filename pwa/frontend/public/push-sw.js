// VAPID public key (an toàn để lộ — dùng để re-subscribe khi iOS xoay sub).
const HNH_VAPID_PUBLIC_KEY =
  "BN_pBg64Zg504PSFLtSJoNnDnEPI74mHm-oq-FaYh88KZWou1xiQ44W_7mC1VLkk0ImTvepK3izbzRApDfdSYhM";

function hnhUrlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function hnhBufToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hnhSaveSubscription(sub) {
  const p256dh = sub.getKey("p256dh");
  const auth = sub.getKey("auth");
  if (!p256dh || !auth) return;
  await fetch("/bff/api/notifications/push/subscribe/", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: hnhBufToB64url(p256dh), auth: hnhBufToB64url(auth) },
    }),
  });
}

// iOS/Android định kỳ THU HỒI push subscription (app bị đẩy khỏi RAM, hết hạn...).
// Khi đó trình duyệt bắn 'pushsubscriptionchange'. Nếu không tự đăng ký lại, công
// tắc Push ở Trang chủ sẽ hiện TẮT và user phải bật tay mỗi lần. Handler này tự
// tạo subscription mới + đẩy lên server (cookie /bff sẵn có) → push không bị đứt.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // Một số trình duyệt cung cấp sẵn newSubscription; nếu không, tự subscribe.
        let sub = event.newSubscription || null;
        if (!sub) {
          sub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: hnhUrlBase64ToUint8Array(HNH_VAPID_PUBLIC_KEY),
          });
        }
        await hnhSaveSubscription(sub);
      } catch (e) {
        // Bỏ qua — lần mở app kế tiếp công tắc vẫn cho bật lại thủ công.
      }
    })()
  );
});

self.addEventListener("push", (event) => {
  // iOS BẮT BUỘC showNotification cho MỌI push — nếu bỏ qua (kể cả khi payload
  // rỗng), iOS thu hồi subscription và các lần sau không nhận nữa. Nên luôn có
  // fallback thay vì return sớm.
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: "HNH HRM", body: event.data.text() };
    }
  }

  const title = payload.title || "HNH HRM";
  const body = payload.body || "Bạn có thông báo mới";
  const url = payload.url || "/pwa/notifications";
  // tag duy nhất/lần đẩy → nhiều đơn KHÔNG đè lên nhau; renotify để báo lại
  // (rung + hiện lên) trên màn khóa dù trùng tag.
  const tag = payload.tag || `hnh-${Date.now()}`;

  const options = {
    body,
    icon: payload.icon || "/pwa/icons/icon-192.png",
    badge: "/pwa/icons/icon-192.png",
    tag,
    renotify: true,
    // Đơn cần duyệt: giữ trên màn khóa/khay tới khi quản lý bấm (Android).
    requireInteraction: !!payload.requireInteraction,
    data: { url },
    vibrate: [200, 100, 200],
    silent: false,
    timestamp: Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // Notify all open app windows so they can play in-app sound
      return self.clients.matchAll({ type: "window" }).then((windowClients) => {
        for (const client of windowClients) {
          client.postMessage({ type: "PUSH_RECEIVED", title, body });
        }
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Clear badge — user acknowledged the notification
  if (self.navigator?.clearAppBadge) {
    self.navigator.clearAppBadge().catch(() => {});
  }

  const url = event.notification.data?.url || "/";
  const fullUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url === fullUrl && "focus" in client) {
            return client.focus();
          }
        }
        return clients.openWindow(fullUrl);
      })
  );
});
