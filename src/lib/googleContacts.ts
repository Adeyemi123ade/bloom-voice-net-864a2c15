import { GOOGLE_WEB_CLIENT_ID } from "@/lib/googleAuth";
import { isNativePlatform, type DeviceContact } from "@/lib/deviceContacts";
import { getMyDefaultCountry, toE164 } from "@/lib/phone";
import { reportProblem } from "@/lib/errorReport";

/**
 * Google Contacts, website only (the Android app reads the phone's own
 * contacts and never uses this).
 *
 * The person taps "Import from Google", Google asks them to share their
 * contacts (read only), and the browser reads the names and phone numbers
 * straight from Google. Nothing is stored on ChiChat's servers: the numbers
 * are kept in this browser like phone contacts on Android, and only checked
 * against ChiChat with the existing contact match. The access pass from
 * Google lives in memory for this one import and is never saved.
 */
export const GOOGLE_CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const PEOPLE_URL = "https://people.googleapis.com/v1/people/me/connections";
const MAX_PAGES = 20; // 20 x 1000 contacts

export type GoogleContactsErrorCode = "cancelled" | "unavailable" | "failed";
export class GoogleContactsError extends Error {
  constructor(public code: GoogleContactsErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

type TokenResponse = { access_token?: string; error?: string; error_description?: string; scope?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string; hint?: string }) => void };
type GoogleOAuth2 = {
  initTokenClient: (cfg: {
    client_id: string;
    scope: string;
    hint?: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
  }) => TokenClient;
  hasGrantedAllScopes: (r: TokenResponse, ...scopes: string[]) => boolean;
};
type GoogleGlobal = { accounts?: { oauth2?: GoogleOAuth2 } };

/** Google Contacts is offered on the website only. */
export function googleContactsAvailable(): boolean {
  return typeof window !== "undefined" && !isNativePlatform();
}

function oauth2(): GoogleOAuth2 | undefined {
  return (window as unknown as { google?: GoogleGlobal }).google?.accounts?.oauth2;
}

let loading: Promise<void> | null = null;
/** Loads Google's sign-in script. Called when Contacts opens so the tap can open Google's window at once. */
export function preloadGoogleContacts(): Promise<void> {
  if (!googleContactsAvailable()) return Promise.resolve();
  if (oauth2()) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => (oauth2() ? resolve() : reject(new Error("gis missing after load")));
    s.onerror = () => reject(new Error("gis script failed"));
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Opens Google's consent window and returns an access pass for reading contacts. */
async function requestToken(hint?: string): Promise<string> {
  try {
    await preloadGoogleContacts();
  } catch (e) {
    throw new GoogleContactsError("unavailable", String(e));
  }
  const api = oauth2();
  if (!api) throw new GoogleContactsError("unavailable", "gis not loaded");
  return new Promise<string>((resolve, reject) => {
    const client = api.initTokenClient({
      client_id: GOOGLE_WEB_CLIENT_ID,
      scope: GOOGLE_CONTACTS_SCOPE,
      hint,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new GoogleContactsError(r.error === "access_denied" ? "cancelled" : "failed", r.error_description || r.error));
          return;
        }
        // Google lets people untick the contacts box on the consent screen.
        if (!api.hasGrantedAllScopes(r, GOOGLE_CONTACTS_SCOPE)) {
          reject(new GoogleContactsError("cancelled", "scope not granted"));
          return;
        }
        resolve(r.access_token);
      },
      error_callback: (e) => {
        const type = e?.type ?? "unknown";
        reject(new GoogleContactsError(type === "popup_closed" ? "cancelled" : "failed", type));
      },
    });
    client.requestAccessToken({ hint });
  });
}

type Person = {
  names?: { displayName?: string }[];
  phoneNumbers?: { value?: string; canonicalForm?: string }[];
};

/** Reads every contact with a phone number (names and numbers only). */
export async function fetchGooglePeople(token: string, fetcher: typeof fetch = fetch): Promise<Person[]> {
  const people: Person[] = [];
  let pageToken = "";
  for (let i = 0; i < MAX_PAGES; i++) {
    const url = new URL(PEOPLE_URL);
    url.searchParams.set("personFields", "names,phoneNumbers");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetcher(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GoogleContactsError("failed", `people ${res.status} ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { connections?: Person[]; nextPageToken?: string };
    people.push(...(data.connections ?? []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return people;
}

/** Turns Google's people into ChiChat contacts: one per person, numbers in +country form, no duplicates. */
export function toDeviceContacts(people: Person[], toNumber: (raw: string) => string | null): DeviceContact[] {
  const out: DeviceContact[] = [];
  const seen = new Set<string>();
  for (const p of people) {
    const phones: string[] = [];
    for (const n of p.phoneNumbers ?? []) {
      const e = toNumber(n.canonicalForm || n.value || "");
      if (e && !phones.includes(e) && !seen.has(e)) phones.push(e);
    }
    if (!phones.length) continue;
    phones.forEach((ph) => seen.add(ph));
    const name = (p.names?.[0]?.displayName ?? "").trim();
    out.push({ name: name || phones[0], phones });
  }
  return out;
}

/** The whole import: consent, read, convert. Errors are GoogleContactsError with a plain code. */
export async function importGoogleContacts(hint?: string): Promise<DeviceContact[]> {
  if (!googleContactsAvailable()) throw new GoogleContactsError("unavailable", "not on web");
  try {
    const token = await requestToken(hint);
    const [people, country] = await Promise.all([fetchGooglePeople(token), getMyDefaultCountry().catch(() => undefined)]);
    return toDeviceContacts(people, (raw) => toE164(raw, country));
  } catch (e) {
    const err = e instanceof GoogleContactsError ? e : new GoogleContactsError("failed", String(e));
    if (err.code !== "cancelled") reportProblem("google-contacts", err.message);
    throw err;
  }
}
