import { supabase } from "@/integrations/supabase/client";

/**
 * Every ChiChat account has a phone number: it is how friends find each
 * other in their contacts. An account without one (a Google sign-in that
 * stopped before the form, or an older account) is sent to add it before
 * using the app, and the database refuses its messages and calls
 * (20261028090000_phone_required.sql).
 *
 * Once this device has seen the number, it is remembered here so the app
 * opens at once, offline too; the check still runs again in the background.
 * Cleared on sign-out (useAuth).
 */
export const PHONE_OK_PREFIX = "chichat.phone_ok.";
export const ADD_PHONE_PATH = "/add-phone";

export type PhoneCheck = "has-phone" | "no-phone" | "unknown";

export function phoneKnownOnDevice(userId: string): boolean {
  try {
    return localStorage.getItem(PHONE_OK_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

export function rememberPhoneOnDevice(userId: string): void {
  try {
    localStorage.setItem(PHONE_OK_PREFIX + userId, "1");
  } catch {
    /* storage unavailable: the check simply runs each time */
  }
}

export function forgetPhoneOnDevice(userId: string): void {
  try {
    localStorage.removeItem(PHONE_OK_PREFIX + userId);
  } catch {
    /* ignore */
  }
}

/** Asks the server whether this account has a saved number. Never guesses: a failed check is "unknown". */
export async function checkMyPhone(userId: string): Promise<PhoneCheck> {
  try {
    const { data, error } = await supabase.rpc("get_my_profile_private");
    if (error) return "unknown";
    const row = (Array.isArray(data) ? data[0] : data) as { phone?: string | null } | null;
    if (row?.phone) {
      rememberPhoneOnDevice(userId);
      return "has-phone";
    }
    forgetPhoneOnDevice(userId);
    return "no-phone";
  } catch {
    return "unknown";
  }
}

/** A Google account that never finished the registration form (it also sets a password and accepts the policy there). */
export function isGoogleOnly(user: {
  app_metadata?: { providers?: unknown; provider?: unknown };
  identities?: Array<{ provider?: string }> | null;
}): boolean {
  const fromIdentities = (user.identities ?? []).map((i) => i.provider).filter(Boolean) as string[];
  const fromMeta = Array.isArray(user.app_metadata?.providers)
    ? (user.app_metadata?.providers as string[])
    : typeof user.app_metadata?.provider === "string"
      ? [user.app_metadata.provider as string]
      : [];
  const providers = new Set([...fromIdentities, ...fromMeta]);
  return providers.has("google") && !providers.has("email");
}

type DbRefusal = { message?: string; hint?: string } | null | undefined;

/** The database refused because this account has no phone number yet. */
export function isNoPhoneError(err: unknown): boolean {
  const e = err as DbRefusal;
  return !!e && (e.hint === "chichat_no_phone" || e.message === "phone_required");
}

/** After such a refusal: forget the device's "has a number" and go add it. */
export function goAddPhone(userId?: string | null): void {
  if (userId) forgetPhoneOnDevice(userId);
  if (window.location.pathname !== ADD_PHONE_PATH) window.location.assign(ADD_PHONE_PATH);
}
