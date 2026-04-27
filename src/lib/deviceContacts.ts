import { Capacitor } from "@capacitor/core";
import { toE164 } from "./phone";

export interface DeviceContact {
  name: string;
  phones: string[]; // E.164
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
 * Load device contacts on a native build via @capacitor-community/contacts.
 * Throws on web or when permission is denied so the caller can show a clear message.
 */
export async function loadNativeContacts(): Promise<DeviceContact[]> {
  if (!isNativePlatform()) {
    throw new Error("NOT_NATIVE");
  }
  // Lazy import so the web bundle never tries to evaluate native code paths.
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
      const e = toE164(p.number ?? "");
      if (e && !phones.includes(e)) phones.push(e);
    }
    if (phones.length) list.push({ name: name.trim() || phones[0], phones });
  }
  return list;
}

const CACHE_KEY = "chichat:contacts:v1";
const CACHE_TTL_MS = 30 * 60 * 1000;

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

export function addManualContact(name: string, e164: string): DeviceContact[] {
  const list = loadManualContacts();
  const existing = list.find((c) => c.phones[0] === e164);
  if (existing) {
    if (name && !existing.name) existing.name = name;
  } else {
    list.push({ name: name || e164, phones: [e164] });
  }
  saveManualContacts(list);
  return list;
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
