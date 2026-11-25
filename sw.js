// Service worker minimal : rend le site installable et garde les fichiers du site pour un affichage rapide.
// Les données (Supabase) passent toujours par le réseau.
const CACHE = "mafolie-v6";

// Notifications push
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Ma Folie et Moi", {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", lang: "fr", data: { url: d.url || "./" }
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const w of wins) if (w.url.split("#")[0].split("?")[0] === target.split("#")[0].split("?")[0] && "focus" in w) {
      if ("navigate" in w && w.url !== target) w.navigate(target).catch(() => {});
      return w.focus();
    }
    return self.clients.openWindow(target);
  }));
});
const FILES = ["./", "index.html", "marie.html", "agenda.js", "style.css", "config.js", "logo.jpg", "icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // Réseau d'abord (toujours la dernière version), cache si hors ligne
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
