import type { DeviceContact } from "@/lib/deviceContacts";

export const APP_INVITE_LINK = "https://chichatapp.com";
export const BATCH_SIZE = 200;
export const PRIVACY_DISMISSED_KEY = "chichat:contacts:privacy-dismissed";

export interface MatchedUser {
  phone: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ActiveContact {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  phone: string;
  call_count: number;
  last_called_at: string | null;
}

export interface InviteContact {
  name: string;
  phone: string;
  invited: boolean;
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function inviteMessage(name: string) {
  return `Hey ${name}, I've been using Chichat for high-quality calls and messages. Join me here so we can call for free: ${APP_INVITE_LINK} Download now!`;
}

export function mergeContacts(a: DeviceContact[], b: DeviceContact[]): DeviceContact[] {
  const byPhone = new Map<string, DeviceContact>();
  for (const c of [...a, ...b]) {
    const key = c.phones[0];
    if (!key) continue;
    const existing = byPhone.get(key);
    if (existing) {
      if (!existing.name && c.name) existing.name = c.name;
    } else {
      byPhone.set(key, { name: c.name, phones: [...c.phones] });
    }
  }
  return Array.from(byPhone.values());
}
