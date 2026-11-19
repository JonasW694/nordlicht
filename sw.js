// Service Worker: App offline verfügbar machen und besuchte Kartenkacheln zwischenspeichern
const SHELL = "nlr-shell-v3";
const TILES = "nlr-tiles-v3";
const MAX_TILES = 1500;
const SHELL_FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Kartenkacheln: erst Cache, sonst Netz (und speichern)
  if (/cache\.kartverket\.no|tile\.openstreetmap\.org/.test(url.hostname) || /\/MapServer\/export/.test(url.pathname) || (url.hostname === "uas-betrieb.de" && /GetMap/i.test(url.search))) {
    e.respondWith(
      caches.open(TILES).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === "opaque") { c.put(req, res.clone()); trimTiles(); }
          return res;
        } catch (err) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // Eigene App-Dateien: erst Netz (für Updates), bei Funkloch Cache
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
    );
  }
  // Wetter- und Polarlichtdaten laufen direkt übers Netz; die App speichert den letzten Stand selbst.
});
