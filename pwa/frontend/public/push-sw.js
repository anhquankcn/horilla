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
    tag: "hnh-push",
    data: { url: payload.url || "/notifications" },
    vibrate: [200, 100, 200],
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // Notify all open app windows so they can play in-app sound
      return self.clients.matchAll({ type: "window" }).then((windowClients) => {
        for (const client of windowClients) {
          client.postMessage({ type: "PUSH_RECEIVED", title, body: options.body });
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
