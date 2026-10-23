import { supabase } from "@/integrations/supabase/client";

/** While ChiChat is open and on screen, "online" is renewed this often. */
export const HEARTBEAT_MS = 60_000;
/** Never write "online" twice within this time (screen flicking on and off). */
const MIN_GAP_MS = 20_000;

/**
 * Online status and "last seen" for the signed-in person.
 *
 * Online while ChiChat is open and on screen (any screen: chats, a chat, a
 * call, settings), renewed every minute. Going to the background, closing
 * the page or signing out sets offline and stamps "last seen" with that
 * moment. Others count someone as online only when the last renewal is under
 * 5 minutes old (lib/presence.ts), so a phone that dies without saying
 * goodbye drops to "last seen" by itself.
 *
 * Before this, the chat list built the same update but never sent it (a
 * database call only goes out when awaited or .then() is called), so nobody
 * was ever shown online and "last seen" stayed at the account's creation date.
 *
 * Returns a stop function (sets offline).
 */
export function startPresence(userId: string): () => void {
  let lastOnlineWrite = 0;
  let stopped = false;

  const write = (online: boolean) => {
    if (online) {
      const now = Date.now();
      if (now - lastOnlineWrite < MIN_GAP_MS) return;
      lastOnlineWrite = now;
    } else {
      lastOnlineWrite = 0;
    }
    void supabase
      .from("profiles")
      .update({ is_online: online, last_seen_at: new Date().toISOString() })
      .eq("id", userId)
      .then(({ error }) => {
        if (error) console.warn("[presence] update failed", error.message);
      });
  };

  const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

  const onVisibility = () => {
    if (stopped) return;
    write(visible());
  };
  const onPageHide = () => {
    if (!stopped) write(false);
  };

  if (visible()) write(true);
  const timer = window.setInterval(() => {
    if (!stopped && visible()) write(true);
  }, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    write(false);
  };
}
