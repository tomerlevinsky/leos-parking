// Service worker for the staff page only (scope /staff): shows "your client arrived" notifications.
// No fetch handler: it never intercepts page loads.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "חניון אורחים · לאוס מדיה", {
    body: d.body || "", icon: "/icon-192.png", tag: d.tag || "parking", renotify: true,
    lang: "he", dir: "rtl", data: { url: d.url || "/staff.html" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/staff.html";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if (new URL(c.url).pathname.startsWith("/staff") && "focus" in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
