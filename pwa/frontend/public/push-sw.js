self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "HNH HRM", body: event.data.text() };
  }

  const title = payload.title || "HNH HRM";
  const options = {
    body: payload.body || "",
    icon: "/pwa/icons/icon-192.png",
    badge: "/pwa/icons/icon-192.png",
    tag: "hnh-push-" + Date.now(),
    data: { url: payload.url || "/notifications" },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
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
