/*
 * ChiChat service worker: lets the app open with no internet.
 *
 * - Pages (navigations): network first; the latest page is saved. With no
 *   network the saved page is used, so ChiChat opens and shows its own
 *   "No internet connection" strip instead of Android's error page.
 * - App files under /assets/ (names change with every version): saved the
 *   first time they load, then served from the phone.
 * - Everything else (Supabase, Agora, Twilio, /version.json, the invite
 *   API): never touched, always the network.
 *
 * Kill switch: if this ever causes trouble, replace this file with one that
 * calls self.registration.unregister() and deploy; phones drop it on their
 * next check.
 */
const PAGE_CACHE = "chichat-page-v1";
const ASSET_CACHE = "chichat-assets-v1";
const MAX_ASSETS = 120;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGE_CACHE, ASSET_CACHE]);
      for (const key of await caches.keys()) {
        if (!keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function trimAssets() {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

async function page(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") await cache.put("/index.html", res.clone());
    return res;
  } catch (err) {
    const saved = await cache.match("/index.html");
    if (saved) return saved;
    throw err;
  }
}

async function asset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") {
    await cache.put(request, res.clone());
    void trimAssets();
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // The invite card pages are served by an API, not the app.
    if (url.pathname === "/i" || url.pathname.startsWith("/i/") || url.pathname.startsWith("/api/")) return;
    event.respondWith(page(req));
    return;
  }
  if (url.pathname.startsWith("/assets/")) event.respondWith(asset(req));
});
