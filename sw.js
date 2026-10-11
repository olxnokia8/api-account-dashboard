/* Service Worker — AI Status PWA
   Strategia:
   - Nawigacje (HTML): network-first, fallback do cache (offline)
   - Pliki statyczne (CSS/JS wbudowane, ikony, manifest): cache-first
   - Wywołania API (/.netlify/functions/*, api.openai.com, openrouter.ai): NIGDY nie cache'ujemy — zawsze network
*/
const CACHE = "ai-status-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/.netlify/functions/") ||
         url.hostname === "api.openai.com" ||
         url.hostname === "openrouter.ai" ||
         url.hostname.endsWith(".openai.com");
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return; // POST-y (funkcje) zawsze na żywo
  const url = new URL(req.url);
  if (isApiRequest(url)) return;     // API — bez cache

  // Nawigacje: network-first
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Statyczne: cache-first, fallback network + zapisz do cache
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
