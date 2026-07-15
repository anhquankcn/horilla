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
    icon: "/pwa/icons/icon-192.png",
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
