/*
 * QuickLoan service worker.
 * - Never touches /api or /health: loan, ID and payment data is never stored on the phone.
 * - Page loads always go to the network; if the phone is offline, a friendly offline page is shown.
 * - Built files in /assets/ have unique names, so they are cached for fast starts.
 * Change VERSION to force every phone to drop its old cache.
 */
const VERSION = "v1";
const SHELL = `quickloan-shell-${VERSION}`;
const ASSETS = `quickloan-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const MAX_ASSETS = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL && k !== ASSETS)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++)
    await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/health"))
    return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
          void trim(cache);
        }
        return res;
      })
    );
  }
});
