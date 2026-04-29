import { supabase } from "@/integrations/supabase/client";
import {
  loadCachedContacts,
  saveCachedContacts,
  type DeviceContact,
} from "@/lib/deviceContacts";
import { toE164 } from "@/lib/phone";

const PENDING_KEY = "chichat:google_oauth:pending";

interface PendingState {
  redirect_uri: string;
}

/** Start Google OAuth flow for Contacts (People API). */
export async function startGoogleContactsConnect(): Promise<void> {
  const redirect_uri = `${window.location.origin}/settings`;
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
    : `${window.location.origin}/settings`;
  sessionStorage.removeItem(PENDING_KEY);
  const { data, error } = await supabase.functions.invoke(
    "google-oauth-callback",
    { body: { action: "exchange", code, redirect_uri } },
  );
  if (error || !data?.ok) throw error ?? new Error("Token exchange failed");
  return { email: data.email ?? null };
}

/** Pull contacts from Google People API and merge into local cache. */
export async function syncGoogleContacts(): Promise<DeviceContact[]> {
  const { data, error } = await supabase.functions.invoke("google-contacts-sync", {});
  if (error) throw error;
  const incoming: DeviceContact[] = ((data?.contacts ?? []) as { name: string; phones: string[] }[])
    .map((c) => ({
      name: c.name,
      phones: c.phones.map((p) => toE164(p)).filter((p): p is string => !!p),
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
