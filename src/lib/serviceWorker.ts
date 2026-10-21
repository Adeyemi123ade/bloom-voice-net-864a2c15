/**
 * Registers public/sw.js so ChiChat opens with no internet (see that file).
 * Production builds only; never on localhost, so development is unaffected.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("[sw] not registered", e));
  });
}
