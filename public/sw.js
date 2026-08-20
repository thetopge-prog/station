// Station service worker — Web Push, plus caching for ASSETS ONLY.
//
// ── What is deliberately NOT cached ───────────────────────────────────────
// HTML, server actions, and every data request go straight to the network,
// always. Two reasons, and both are the difference between a useful app and a
// dangerous one:
//
//   1. A cached page would let a deploy go stale on a tablet nobody thinks to
//      reload, and the POS must run the code the shop actually shipped.
//   2. Every screen here writes through a server action. An app shell that
//      loads with no server behind it looks alive while every tap fails — an
//      honest "cannot reach the till" beats a UI that lies.
//
// Genuine offline operation lives in the Station Hub (see docs/HUB.md), where
// the server is inside the shop and has a database next to it. Rebuilding that
// queue a second time inside the browser would be two sources of truth for the
// same orders.
//
// ── What IS cached ───────────────────────────────────────────────────────
//   /_next/static/*  — content-hashed by the build, so a cached copy can never
//                      be the wrong version. Cache-first.
//   /icons/, /logo*  — brand assets, changed about never. Cache-first.
//   /img/*           — product photos from storage. The heaviest thing on a
//                      menu and the slowest over shop Wi-Fi, but NOT versioned,
//                      so: serve the cached copy instantly, refresh it in the
//                      background. A replaced photo appears on the next open.
//
// Having a fetch handler at all is also what makes the app installable — until
// this existed, "add to home screen" was unavailable in Chrome.

const CACHE = "station-static-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/** Immutable: a hashed filename is its own version stamp. */
const isImmutable = (p) => p.startsWith("/_next/static/") || p.startsWith("/icons/") || p.startsWith("/logo");
/** Stable name, changeable content — worth caching, must not go stale forever. */
const isPhoto = (p) => p.startsWith("/img/");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  if (isImmutable(path)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // never cache an error page under an asset's name
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (isPhoto(path)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          // offline with nothing cached: let it fail like any missing image
          .catch(() => hit);
        return hit || network;
      }),
    );
  }

  // everything else — pages, server actions, data — untouched
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* non-JSON payload */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "ستيشن", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      dir: "rtl",
      lang: "ar",
      tag: data.tag,
      vibrate: [200, 100, 200],
      data: { url: data.url || "/orders" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/orders";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
