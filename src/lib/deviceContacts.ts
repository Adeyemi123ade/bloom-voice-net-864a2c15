import { Capacitor } from "@capacitor/core";
import { toE164 } from "./phone";

export interface DeviceContact {
  name: string;
  phones: string[]; // E.164 where possible, raw as fallback
  avatar?: string | null;
}

/** True when running inside a Capacitor native shell (iOS/Android). */
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Normalize a phone number to E.164 if possible, otherwise return the raw
 * number stripped of formatting so it can still be stored and matched.
 */
function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const e164 = toE164(raw);
  if (e164) return e164;
  // Fallback: strip everything except digits and leading +
  const stripped = raw.replace(/[^\d+]/g, "");
  return stripped.length >= 7 ? stripped : null;
}

/**
 * Load device contacts on a native build via @capacitor-community/contacts.
 * Throws on web or when permission is denied so the caller can show a clear message.
 */
export async function loadNativeContacts(): Promise<DeviceContact[]> {
  if (!isNativePlatform()) {
    throw new Error("NOT_NATIVE");
  }
  const mod = await import("@capacitor-community/contacts");
  const Contacts = mod.Contacts;

  const perm = await Contacts.requestPermissions();
  if (perm.contacts !== "granted") {
    throw new Error("PERMISSION_DENIED");
  }

  const result = await Contacts.getContacts({
    projection: { name: true, phones: true },
  });

  const list: DeviceContact[] = [];
  for (const c of result.contacts ?? []) {
    const name =
      c.name?.display ??
      [c.name?.given, c.name?.family].filter(Boolean).join(" ") ??
      "";
    const phones: string[] = [];
    for (const p of c.phones ?? []) {
      const normalized = normalizePhone(p.number ?? "");
      if (normalized && !phones.includes(normalized)) {
        phones.push(normalized);
      }
    }
    if (phones.length) {
      list.push({ name: name.trim() || phones[0], phones });
    }
  }
  return list;
}

/**
 * True when the browser supports the Contact Picker API
 * (Android Chrome 80+, served over HTTPS, in the top-level frame).
 */
export function isWebContactPickerSupported(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      "contacts" in navigator &&
      typeof (navigator as Navigator & { contacts?: { select?: unknown } })
        .contacts?.select === "function"
    );
  } catch {
    return false;
  }
}

/**
 * Show the native Android Chrome contact picker. The user picks one or more
 * contacts and the browser returns just those — we never get bulk access.
 */
export async function pickWebContacts(): Promise<DeviceContact[]> {
  if (!isWebContactPickerSupported()) throw new Error("NOT_SUPPORTED");
  const nav = navigator as Navigator & {
    contacts: {
      select: (
        props: string[],
        opts?: { multiple?: boolean },
      ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
    };
  };
  const picked = await nav.contacts.select(["name", "tel"], { multiple: true });
  const list: DeviceContact[] = [];
  for (const c of picked ?? []) {
    const name = (c.name?.[0] ?? "").trim();
    const phones: string[] = [];
    for (const t of c.tel ?? []) {
      const e = toE164(t);
      if (e && !phones.includes(e)) phones.push(e);
    }
    if (phones.length) list.push({ name: name || phones[0], phones });
  }
  return list;
}

const CACHE_KEY = "chichat:contacts:v1";
// Keep the cache effectively forever — it's just a UX optimization so previously
// loaded device/Google contacts stay visible across sessions even if the next
// sync is delayed or fails. Native/Google sync flows overwrite it on success.
const CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

interface CachedSync {
  at: number;
  contacts: DeviceContact[];
}

export function loadCachedContacts(): DeviceContact[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSync;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.contacts;
  } catch {
    return null;
  }
}

export function saveCachedContacts(contacts: DeviceContact[]) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), contacts } satisfies CachedSync),
    );
  } catch {
    /* quota — ignore */
  }
}

export function clearContactsCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Manual contacts entered on web (since device sync only works on native). */
const MANUAL_KEY = "chichat:contacts:manual:v1";

export function loadManualContacts(): DeviceContact[] {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveManualContacts(list: DeviceContact[]) {
  try {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function addManualContact(
  name: string,
  e164: string,
  avatar?: string | null,
): DeviceContact[] {
  const list = loadManualContacts();
  const existing = list.find((c) => c.phones[0] === e164);
  if (existing) {
    if (name && !existing.name) existing.name = name;
    if (avatar) existing.avatar = avatar;
  } else {
    list.push({ name: name || e164, phones: [e164], avatar: avatar ?? null });
  }
  saveManualContacts(list);
  return list;
}

const DEFAULT_AVATAR_KEY = "chichat:contacts:defaultAvatar:v1";

export function getDefaultContactAvatar(): string | null {
  try {
    return localStorage.getItem(DEFAULT_AVATAR_KEY);
  } catch {
    return null;
  }
}

export function setDefaultContactAvatar(dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(DEFAULT_AVATAR_KEY, dataUrl);
    else localStorage.removeItem(DEFAULT_AVATAR_KEY);
  } catch {
    /* ignore */
  }
}

export function removeManualContact(e164: string): DeviceContact[] {
  const list = loadManualContacts().filter((c) => c.phones[0] !== e164);
  saveManualContacts(list);
  return list;
}

/** Add a phone number to an existing manual contact (matched by name). */
export function addPhoneToManualContact(
  name: string,
  e164: string,
): DeviceContact[] {
  const list = loadManualContacts();
  const existing = list.find(
    (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  if (existing) {
    if (!existing.phones.includes(e164)) existing.phones.push(e164);
  } else {
    list.push({ name: name || e164, phones: [e164] });
  }
  saveManualContacts(list);
  return list;
}
