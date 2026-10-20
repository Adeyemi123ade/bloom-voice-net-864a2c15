import type { User } from "@supabase/supabase-js";

/**
 * The same person as before (only the session token changed)? Then keep the
 * same user object. Screens reload their data when `user` changes; a new but
 * identical object on every auth event (start up sends two or three, then one
 * per token refresh) made every screen load everything two or three times.
 */
function userKey(u: User | null | undefined): string {
  if (!u) return "";
  return JSON.stringify([
    u.id,
    u.email,
    u.phone,
    u.email_confirmed_at,
    u.phone_confirmed_at,
    u.created_at,
    u.user_metadata,
    u.app_metadata,
  ]);
}

export function keepSameUser(prev: User | null, next: User | null | undefined): User | null {
  if (!next) return null;
  return prev && userKey(prev) === userKey(next) ? prev : next;
}
