import { supabase } from "@/integrations/supabase/client";
import {
  loadCachedContacts,
  saveCachedContacts,
  type DeviceContact,
} from "@/lib/deviceContacts";
import { countryFromE164, toE164 } from "@/lib/phone";

const PENDING_KEY = "chichat:google_oauth:pending";

export class GoogleContactsReconnectRequired extends Error {
  constructor() {
    super("Reconnect Google Contacts and allow contact access.");
    this.name = "GoogleContactsReconnectRequired";
  }
}

interface PendingState {
  redirect_uri: string;
}

/**
 * Build a redirect URI Google will accept. Inside the native shell, the page's
 * origin is `http://localhost` or `capacitor://`, which Google's OAuth rejects
 * with a 403 ("disallowed_useragent" / redirect_uri_mismatch). To stay seamless,
 * we always send users back to the production web URL — that single redirect
 * URI is the only one registered in the Google Cloud Console.
 */
function resolveRedirectUri(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const isWebHttps =
    origin.startsWith("https://") &&
    !origin.includes("localhost") &&
    !origin.startsWith("capacitor://");
  // Use the live web origin when we're already on a real https domain
  // (covers preview + published + custom domains). Otherwise fall back to
  // the published URL so Google always sees an allowed redirect.
  return isWebHttps
    ? `${origin}/settings`
    : "https://bloom-voice-net.lovable.app/settings";
}

/** Start Google OAuth flow for Contacts (People API). */
export async function startGoogleContactsConnect(): Promise<void> {
  const redirect_uri = resolveRedirectUri();
  const { data, error } = await supabase.functions.invoke(
    "google-oauth-callback",
    { body: { action: "auth_url", redirect_uri } },
  );
  if (error || !data?.url) throw error ?? new Error("Failed to build auth URL");
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ redirect_uri } satisfies PendingState));
  window.location.href = data.url;
}

/** Call after redirect back from Google with ?code=... in URL. */
export async function completeGoogleContactsConnect(code: string): Promise<{ email: string | null }> {
  const pending = sessionStorage.getItem(PENDING_KEY);
  const redirect_uri = pending
    ? (JSON.parse(pending) as PendingState).redirect_uri
    : resolveRedirectUri();
  sessionStorage.removeItem(PENDING_KEY);
  const { data, error } = await supabase.functions.invoke(
    "google-oauth-callback",
    { body: { action: "exchange", code, redirect_uri } },
  );
  if (error) throw await normalizeGoogleContactsError(error);
  if (data?.reconnectRequired) throw new GoogleContactsReconnectRequired();
  if (!data?.ok) throw new Error("Token exchange failed");
  return { email: data.email ?? null };
}

/** Pull contacts from Google People API and merge into local cache. */
export async function syncGoogleContacts(): Promise<DeviceContact[]> {
  const { data, error } = await supabase.functions.invoke("google-contacts-sync", {});
  if (error) throw await normalizeGoogleContactsError(error);
  if (data?.reconnectRequired) throw new GoogleContactsReconnectRequired();
  const defaultCountry = await getMyDefaultCountry();
  const incoming: DeviceContact[] = ((data?.contacts ?? []) as { name: string; phones: string[] }[])
    .map((c) => ({
      name: c.name,
      phones: Array.from(new Set(
        c.phones.map((p) => normalizeImportedPhone(p, defaultCountry)).filter((p): p is string => !!p),
      )),
    }))
    .filter((c) => c.phones.length);

  // Merge with existing cache (dedupe by first phone)
  const existing = loadCachedContacts() ?? [];
  const map = new Map<string, DeviceContact>();
  for (const c of [...existing, ...incoming]) {
    const key = c.phones[0];
    if (!map.has(key)) map.set(key, c);
  }
  const merged = [...map.values()];
  saveCachedContacts(merged);
  return merged;
}

async function getMyDefaultCountry() {
  const { data } = await supabase
    .from("profiles")
    .select("phone")
    .maybeSingle();
  return countryFromE164((data as { phone?: string | null } | null)?.phone);
}

function normalizeImportedPhone(raw: string, defaultCountry?: ReturnType<typeof countryFromE164>) {
  const e164 = toE164(raw, defaultCountry);
  if (e164) return e164;

  // Do not drop Google contacts just because a number is saved in a local
  // format that cannot be confidently normalized. Keep a dialable/displayable
  // fallback so large address books don't appear as “0 contacts”.
  const fallback = raw.replace(/[^\d+]/g, "");
  const digits = fallback.replace(/\D/g, "");
  return digits.length >= 5 ? fallback : null;
}

/** Returns true if the current user has linked their Google account. */
export async function isGoogleConnected(): Promise<boolean> {
  const { data } = await supabase
    .from("google_oauth_tokens")
    .select("user_id")
    .maybeSingle();
  return !!data;
}

async function normalizeGoogleContactsError(error: unknown): Promise<Error> {
  const context = (error as { context?: Response })?.context;
  if (context) {
    try {
      const body = await context.clone().json();
      const message = extractErrorMessage(body);
      if (body?.reconnectRequired || /scope|permission|contacts access/i.test(message)) {
        return new GoogleContactsReconnectRequired();
      }
      return new Error(message || "Could not sync Google Contacts.");
    } catch { /* fall through */ }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT|permission/i.test(message)) {
    return new GoogleContactsReconnectRequired();
  }
  return error instanceof Error ? error : new Error(message || "Could not sync Google Contacts.");
}

function extractErrorMessage(body: any): string {
  const direct = body?.error;
  if (typeof direct === "string") return direct;
  if (typeof direct?.message === "string") return direct.message;
  if (typeof direct?.error?.message === "string") return direct.error.message;
  return "";
}
