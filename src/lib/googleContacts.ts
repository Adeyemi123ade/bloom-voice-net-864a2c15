import { supabase } from "@/integrations/supabase/client";
import {
  loadCachedContacts,
  saveCachedContacts,
  type DeviceContact,
} from "@/lib/deviceContacts";
import { getMyDefaultCountry, toE164 } from "@/lib/phone";

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
 * we always send users back to a registered production URL.
 */
function resolveRedirectUri(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // Local development: Google supports http://localhost:PORT
  if (origin.startsWith("http://localhost")) {
    return `${origin}/settings`;
  }

  // Keep the redirect on the live ChiChat domain so the user keeps the same
  // browser session after Google sends them back.
  if (origin === "https://www.chichatapp.com") {
    return "https://www.chichatapp.com/settings";
  }
  return "https://chichatapp.com/settings";
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

  // If the redirect URI is on a different origin than we're on now (e.g. a
  // preview deployment redirecting to the published URL), open Google in a
  // new tab so the user isn't stranded on a different origin. Same-origin
  // flows stay in-tab as before.
  const sameOrigin = redirect_uri.startsWith(window.location.origin);
  if (sameOrigin) {
    window.location.href = data.url;
  } else {
    const popup = window.open(data.url, "_blank", "noopener,noreferrer");
    if (!popup) {
      // Popup blocked — fall back so the user can still complete the flow.
      window.location.href = data.url;
    }
  }
}

/**
 * Call after redirect back from Google with ?code=&state=... in URL.
 * `state` is the value we sent Google in the initial auth request (the
 * user id that started the flow) — pass it through so the backend can
 * reject a code exchange started by someone else (CSRF / account-linking
 * confusion: without this, an attacker could get their own Google auth code
 * accepted into a victim's account by tricking the victim into completing
 * the attacker's OAuth redirect).
 */
export async function completeGoogleContactsConnect(
  code: string,
  state: string | null,
): Promise<{ email: string | null }> {
  const pending = sessionStorage.getItem(PENDING_KEY);
  const redirect_uri = pending
    ? (JSON.parse(pending) as PendingState).redirect_uri
    : resolveRedirectUri();
  sessionStorage.removeItem(PENDING_KEY);
  const { data, error } = await supabase.functions.invoke(
    "google-oauth-callback",
    { body: { action: "exchange", code, redirect_uri, state } },
  );
  if (error) throw await normalizeGoogleContactsError(error);
  if (data?.reconnectRequired) throw new GoogleContactsReconnectRequired();
  if (!data?.ok) throw new Error("Token exchange failed");
  return { email: data.email ?? null };
}

/** Pull contacts from Google People API and merge into local cache. */
export async function syncGoogleContacts(): Promise<{ contacts: DeviceContact[], warning?: string }> {
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
  return { contacts: merged, warning: data?.warning };
}

function normalizeImportedPhone(raw: string, defaultCountry?: Awaited<ReturnType<typeof getMyDefaultCountry>>) {
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

export async function normalizeGoogleContactsError(error: unknown): Promise<Error> {
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
  // Google's raw OAuth token-endpoint error shape, forwarded as-is by
  // google-oauth-callback on a failed exchange: { error: "invalid_client",
  // error_description: "..." }. None of the checks above match this (the
  // inner "error" is a string, not an object with .message), so it was
  // silently discarded and replaced by the generic fallback below.
  if (typeof direct?.error === "string") {
    return direct.error_description
      ? `${direct.error}: ${direct.error_description}`
      : direct.error;
  }
  return "";
}
