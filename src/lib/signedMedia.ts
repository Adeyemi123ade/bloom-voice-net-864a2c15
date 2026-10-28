/**
 * Signed-URL helper for chat-media attachments.
 *
 * The `chat-media` bucket is private (migration 20261017130000): only people
 * in the chat can open a file, and only through a signed link made here.
 * Falling back to the original URL is kept only for the moment a signed link
 * can't be made (offline); it no longer opens the file by itself.
 *
 * Stored message URLs may be in either form:
 *   .../storage/v1/object/public/chat-media/<path>
 *   .../storage/v1/object/sign/chat-media/<path>?token=...
 * Both resolve to the same `<path>` inside the bucket.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "chat-media";
const EXPIRY_SEC = 60 * 60; // 1 hour
const REFRESH_BEFORE_MS = 5 * 60 * 1000; // refresh 5 min before expiry

type CacheEntry = { url: string; expiresAt: number; inflight?: Promise<string> };
const cache = new Map<string, CacheEntry>();

/** Extract the in-bucket path from a chat-media storage URL. Returns null if URL is not chat-media. */
export function parseChatMediaPath(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/chat-media\/([^?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * An attachment address the app may open or show: https, or a file made on
 * this phone (blob:). Anything else, like a "javascript:" link written into
 * a message by hand, would run code inside ChiChat when tapped, so it
 * becomes "" (nothing opens). The database refuses such messages too
 * (20261028200000_security_hardening.sql).
 */
export function safeMediaUrl(url: string | null | undefined): string {
  const u = (url ?? "").trim();
  return /^(https:\/\/|blob:)/i.test(u) ? u : "";
}

/** Resolve a (possibly public) chat-media URL to a fresh signed URL. Cached. */
export async function getSignedChatMediaUrl(originalUrl: string): Promise<string> {
  const path = parseChatMediaPath(originalUrl);
  if (!path) return safeMediaUrl(originalUrl); // not a chat-media URL: only a safe one passes

  const now = Date.now();
  const cached = cache.get(path);
  if (cached && cached.expiresAt - REFRESH_BEFORE_MS > now) return cached.url;
  if (cached?.inflight) return cached.inflight;

  const inflight = (async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, EXPIRY_SEC);
    if (error || !data?.signedUrl) {
      // Can't sign right now (offline, or no access): leave the stored URL.
      return safeMediaUrl(originalUrl);
    }
    cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + EXPIRY_SEC * 1000 });
    return data.signedUrl;
  })();

  cache.set(path, { url: cached?.url ?? originalUrl, expiresAt: cached?.expiresAt ?? 0, inflight });
  try {
    return await inflight;
  } finally {
    const entry = cache.get(path);
    if (entry) delete entry.inflight;
  }
}

/** React hook: returns a usable URL, auto-refreshing before the signed URL expires. */
export function useSignedMediaUrl(originalUrl: string | undefined | null): string {
  const [url, setUrl] = useState<string>(safeMediaUrl(originalUrl));

  useEffect(() => {
    if (!originalUrl) {
      setUrl("");
      return;
    }
    let cancelled = false;
    let timer: number | null = null;

    const refresh = async () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      const resolved = await getSignedChatMediaUrl(originalUrl);
      if (cancelled) return;
      setUrl(resolved);
      // Schedule next refresh just before expiry
      const path = parseChatMediaPath(originalUrl);
      if (path) {
        const entry = cache.get(path);
        if (entry && entry.expiresAt > 0) {
          const delay = Math.max(30_000, entry.expiresAt - Date.now() - REFRESH_BEFORE_MS);
          timer = window.setTimeout(refresh, delay);
        }
      }
    };
    refresh();

    // Mobile browsers throttle/suspend setTimeout in backgrounded tabs, so
    // the scheduled refresh above can miss its window while the app is
    // switched away from — common on mobile, rare on desktop. Re-check as
    // soon as the tab is visible again instead of waiting for a timer that
    // may have been delayed past actual expiry.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [originalUrl]);

  return url || originalUrl || "";
}
