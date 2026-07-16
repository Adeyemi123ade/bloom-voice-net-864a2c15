// Fetches contacts from Google People API for the authenticated user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts";
const CONTACTS_READONLY_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";

type Contact = { name: string; phones: string[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const token = auth.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const user = { id: claims.claims.sub as string };

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: row } = await admin
      .from("google_oauth_tokens")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row) {
      return json({
        error: "Google Contacts isn't connected yet. Tap Connect Google to link your account.",
        reconnectRequired: true,
      });
    }
    if (!hasContactsScope(row.scope)) {
      await admin.from("google_oauth_tokens").delete().eq("user_id", user.id);
      return json({
        error: "Google contacts permission is missing. Please reconnect Google Contacts.",
        reconnectRequired: true,
      });
    }

    let accessToken = row.access_token as string;
    const isExpired = new Date(row.expires_at).getTime() < Date.now() + 60000;
    
    if (isExpired && row.refresh_token) {
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
          client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
          refresh_token: row.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const t = await r.json();
      if (r.ok) {
        accessToken = t.access_token;
        await admin.from("google_oauth_tokens").update({
          access_token: t.access_token,
          expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
        }).eq("user_id", user.id);
      } else {
        console.error("google-contacts-sync: token refresh failed", { userId: user.id, error: t });
        // Any refresh failure — not just invalid_grant — means we cannot
        // obtain a valid access token. Falling through and calling the
        // People API with the known-expired token below is guaranteed to
        // 401, and that 401 wasn't being distinguished from "this account
        // really has zero contacts": it silently returned an empty contact
        // list with a "No contacts found in this Google account" warning,
        // which looked exactly like sync being fundamentally broken instead
        // of prompting the user to reconnect.
        return json({
          error: t.error === "invalid_grant"
            ? "Google session expired. Please reconnect."
            : "Could not refresh your Google session. Please reconnect Google Contacts.",
          reconnectRequired: true,
        });
      }
    } else if (isExpired && !row.refresh_token) {
       return json({
         error: "Google session expired and no refresh token available. Please reconnect.",
         reconnectRequired: true,
       });
    }

    const map = new Map<string, Contact>();
    const sources = { saved: 0, other: 0, directory: 0 };
    const debug = {
      savedRaw: 0,
      otherRaw: 0,
      directoryRaw: 0,
      savedError: null as string | null,
      otherError: null as string | null,
      directoryError: null as string | null,
    };

    // 1. Saved Google Contacts
    {
      const result = await fetchConnections(accessToken);
      if (result.scopeError) {
        await admin.from("google_oauth_tokens").delete().eq("user_id", user.id);
        return json({
          error: "Google contacts permission is missing. Please reconnect Google Contacts.",
          reconnectRequired: true,
        });
      }
      if (result.authError) {
        // The access token we just used (freshly refreshed, or not expired
        // per our own clock) was rejected outright by Google — e.g. the
        // user revoked access from their Google Account settings. Report
        // this plainly instead of letting it fall through to "0 contacts
        // found", which previously made a revoked connection look identical
        // to an account that has no contacts.
        console.error("google-contacts-sync: People API rejected access token", { userId: user.id, errorMessage: result.errorMessage });
        await admin.from("google_oauth_tokens").delete().eq("user_id", user.id);
        return json({
          error: "Google session is no longer valid. Please reconnect Google Contacts.",
          reconnectRequired: true,
        });
      }
      debug.savedRaw = result.rawCount;
      debug.savedError = result.errorMessage;
      for (const c of result.contacts) {
        sources.saved++;
        mergeContact(map, c);
      }
    }

    // 2. "Other contacts"
    {
      const result = await fetchOtherContacts(accessToken);
      debug.otherRaw = result.rawCount;
      debug.otherError = result.errorMessage;
      for (const c of result.contacts) {
        sources.other++;
        mergeContact(map, c);
      }
    }

    // 3. Workspace directory
    {
      const result = await fetchDirectoryPeople(accessToken);
      debug.directoryRaw = result.rawCount;
      debug.directoryError = result.errorMessage;
      for (const c of result.contacts) {
        sources.directory++;
        mergeContact(map, c);
      }
    }

    const contacts = [...map.values()];
    console.log("google-contacts-sync", JSON.stringify({ userId: user.id, totalReturned: contacts.length, sources, debug }));
    
    // Help users troubleshoot empty syncs
    let warning = null;
    if (contacts.length === 0) {
      if (debug.savedError?.includes("not enabled")) {
        warning = "Google People API is not enabled in your Google Cloud Project.";
      } else if (debug.savedRaw > 0) {
        warning = `Found ${debug.savedRaw} contacts, but none had phone numbers.`;
      } else {
        warning = "No contacts found in this Google account.";
      }
    }

    return json({ contacts, sources, debug, totalReturned: contacts.length, warning });
  } catch (e) {
    console.error("google-contacts-sync: unhandled error", e);
    return json({ error: String(e) }, 500);
  }
});

async function fetchConnections(
  accessToken: string,
): Promise<{ contacts: Contact[]; rawCount: number; errorMessage: string | null; scopeError?: boolean; authError?: boolean }> {
  const out: Contact[] = [];
  let rawCount = 0;
  let errorMessage: string | null = null;
  let pageToken: string | undefined;
  do {
    const url = new URL("https://people.googleapis.com/v1/people/me/connections");
    url.searchParams.set("personFields", "names,phoneNumbers,emailAddresses");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!res.ok) {
      errorMessage = errorSummary(data);
      if (isInsufficientScope(data)) return { contacts: [], rawCount, errorMessage, scopeError: true };
      if (res.status === 401) return { contacts: [], rawCount, errorMessage, authError: true };
      break;
    }
    const people = data.connections ?? [];
    rawCount += people.length;
    for (const p of people) {
      const c = personToContact(p);
      if (c) out.push(c);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { contacts: out, rawCount, errorMessage };
}

async function fetchOtherContacts(
  accessToken: string,
): Promise<{ contacts: Contact[]; rawCount: number; errorMessage: string | null }> {
  const out: Contact[] = [];
  let rawCount = 0;
  let errorMessage: string | null = null;
  let pageToken: string | undefined;
  do {
    const url = new URL("https://people.googleapis.com/v1/otherContacts");
    url.searchParams.set("readMask", "names,phoneNumbers,emailAddresses");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!res.ok) {
      errorMessage = errorSummary(data);
      break;
    }
    const people = data.otherContacts ?? [];
    rawCount += people.length;
    for (const p of people) {
      const c = personToContact(p);
      if (c) out.push(c);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { contacts: out, rawCount, errorMessage };
}

async function fetchDirectoryPeople(
  accessToken: string,
): Promise<{ contacts: Contact[]; rawCount: number; errorMessage: string | null }> {
  const out: Contact[] = [];
  let rawCount = 0;
  let errorMessage: string | null = null;
  let pageToken: string | undefined;
  do {
    const url = new URL("https://people.googleapis.com/v1/people:listDirectoryPeople");
    url.searchParams.set("readMask", "names,phoneNumbers,emailAddresses");
    url.searchParams.set("sources", "DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT");
    url.searchParams.append("sources", "DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!res.ok) {
      errorMessage = errorSummary(data);
      break;
    }
    const people = data.people ?? [];
    rawCount += people.length;
    for (const p of people) {
      const c = personToContact(p);
      if (c) out.push(c);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { contacts: out, rawCount, errorMessage };
}

function personToContact(p: any): Contact | null {
  const name: string =
    p.names?.[0]?.displayName ??
    p.emailAddresses?.[0]?.value ??
    "";
  const phones: string[] = Array.from(new Set((p.phoneNumbers ?? [])
    .flatMap((n: { canonicalForm?: string; value?: string }) => [
      (n?.canonicalForm ?? "").trim(),
      (n?.value ?? "").trim(),
    ])
    .filter(Boolean)));
  if (!name || phones.length === 0) return null;
  return { name, phones };
}

function mergeContact(map: Map<string, Contact>, c: Contact) {
  const key = c.phones[0];
  if (!map.has(key)) map.set(key, c);
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isInsufficientScope(data: any) {
  const details = data?.error?.details ?? [];
  return details.some((d: any) =>
    d?.reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT"
  );
}

function errorSummary(data: any): string | null {
  return data?.error?.message ?? data?.error?.status ?? null;
}

function hasContactsScope(scope: string | null | undefined) {
  const granted = new Set(String(scope ?? "").split(/\s+/).filter(Boolean));
  return granted.has(CONTACTS_SCOPE) || granted.has(CONTACTS_READONLY_SCOPE);
}
