/* Feasibility3D service worker.
 *
 * - App shell: pages and /_next/static assets are cached so the app opens
 *   offline. Pages are network-first (fresh when online), assets cache-first
 *   (they are content-hashed).
 * - Spills: GET /api/* responses are network-first and cached, so the
 *   last-viewed spills (list, detail, readings, scenario) can be read offline.
 * - Offline is read-only: non-GET /api calls get a 503 JSON message instead of
 *   a network error. Evidence uploads are queued by the app (IndexedDB) and
 *   sent on reconnect; see app/lib/offlineQueue.ts.
 */
const VERSION = "v1";
const SHELL = `f3d-shell-${VERSION}`;
const ASSETS = `f3d-assets-${VERSION}`;
const API = "f3d-api"; // unversioned: survives app updates; cleared on logout
const SHELL_URLS = ["/", "/spills", "/evidence", "/reports", "/compliance", "/help", "/settings", "/login",
  "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
// Engine reads worth keeping for offline viewing.
const API_CACHEABLE = /^\/api\/(health|me|scenario|readings|verify|notifications|pipelines|spills)(\/|$|\?)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => Promise.all(SHELL_URLS.map((u) => c.add(u).catch(() => {})))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS && k !== API).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "CACHE_URLS" && Array.isArray(msg.urls)) {
    // Assets the page loaded before this worker took control.
    event.waitUntil(
      caches.open(ASSETS).then((c) =>
        Promise.all(msg.urls.filter((u) => new URL(u).pathname.startsWith("/_next/static/")).map((u) => c.add(u).catch(() => {}))),
      ),
    );
  } else if (msg.type === "CLEAR_API_CACHE") {
    event.waitUntil(caches.delete(API));
  }
});

async function networkFirst(request, cacheName, cacheKey) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(cacheKey || request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(cacheKey || request, { ignoreVary: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

function offlineJson(message, status = 503) {
  return new Response(JSON.stringify({ error: "offline", message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    if (req.method !== "GET") {
      event.respondWith(
        fetch(req).catch(() => offlineJson("You're offline. Changes are disabled until you reconnect.")),
      );
      return;
    }
    if (API_CACHEABLE.test(url.pathname)) {
      event.respondWith(
        networkFirst(req, API).catch(() => offlineJson("You're offline and this hasn't been viewed yet.")),
      );
    }
    return; // PDFs and other downloads: network only
  }

  if (req.method !== "GET") return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (req.mode === "navigate") {
    // Cache each visited page (e.g. /spills/SPL-0001) without its query string.
    const key = url.origin + url.pathname;
    event.respondWith(
      networkFirst(req, SHELL, key).catch(async () =>
        (await caches.match("/", { cacheName: SHELL })) || offlineJson("Offline", 503),
      ),
    );
    return;
  }

  // RSC payloads for client-side navigations: network-first, cached.
  if (req.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(req, SHELL).catch(() => offlineJson("Offline", 503)));
  }
});
