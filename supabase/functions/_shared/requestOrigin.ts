// Where a request came from, for the admin page: "live" (chichatapp.com or
// the Android app), "preview" (a Vercel preview link), "local" (a copy on a
// laptop) or "unknown". Same rule as public.classify_origin in the database.
export type RequestOrigin = "live" | "preview" | "local" | "unknown";

const LIVE_HOSTS = new Set(["chichatapp.com", "www.chichatapp.com", "bloom-voice-net-864a2c15.vercel.app"]);

export function classifyOrigin(value: string | null | undefined): RequestOrigin {
  const raw = (value ?? "").trim();
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(raw);
  if (!m) return "unknown";
  const host = m[1].toLowerCase();
  // The Android app's own pages are served as https://localhost.
  if (/^https:\/\/localhost(\/|$)/i.test(raw)) return "live";
  if (LIVE_HOSTS.has(host)) return "live";
  if (host.endsWith(".vercel.app")) return "preview";
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.)/.test(host)) return "local";
  return "unknown";
}

export function originOfRequest(req: Request): RequestOrigin {
  return classifyOrigin(req.headers.get("origin") ?? req.headers.get("referer"));
}
