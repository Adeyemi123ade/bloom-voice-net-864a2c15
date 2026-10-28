import { supabase } from "@/integrations/supabase/client";
import { BATCH_SIZE, type MatchedUser } from "@/components/contacts/contactsHelpers";
import { inBatches, isFreshFor, loadMatchCache, phonesKey, saveMatchCache } from "@/lib/contactMatchCache";
import { loadCachedContacts, loadManualContacts } from "@/lib/deviceContacts";

/**
 * People offered in "Start a new chat". The server only returns people the
 * user already chats with (search_users); this adds the people from the
 * user's own contacts on this device (phone book on Android, numbers saved
 * with New Contact on web), which the contact match already found.
 */
export type NewChatPerson = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string;
  show_last_seen?: boolean | null;
};

const digitsOf = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");

/** My contacts who are on ChiChat: the recent saved check, or a new check of the contacts kept on this device. */
export async function myContactMatches(userId: string): Promise<MatchedUser[]> {
  const saved = loadMatchCache(userId);
  const local = [...(loadCachedContacts() ?? []), ...loadManualContacts()];
  const phones = Array.from(new Set(local.flatMap((c) => c.phones).filter(Boolean)));
  if (phones.length === 0) return saved?.matches ?? [];
  // Checked recently (here or on Contacts) for the same numbers: reuse it, so
  // people who joined since appear within 30 minutes without sending the
  // whole phone book every time this screen opens.
  const key = phonesKey(phones);
  if (isFreshFor(saved, key)) return saved!.matches;
  try {
    const found = await inBatches(phones, BATCH_SIZE, 4, async (batch) => {
      const { data, error } = await supabase.rpc("match_contacts_by_phone", { _phones: batch });
      if (error) throw error;
      return (data ?? []) as MatchedUser[];
    });
    const unique = Array.from(new Map(found.map((m) => [m.phone, m])).values());
    saveMatchCache(userId, { phonesKey: key, matches: unique, stats: saved?.stats ?? [], checkedAt: Date.now() });
    return unique;
  } catch {
    return saved?.matches ?? [];
  }
}

export function filterContactMatches(matches: MatchedUser[], query: string): MatchedUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return matches;
  const qDigits = digitsOf(q);
  return matches.filter(
    (m) =>
      (m.display_name ?? "").toLowerCase().includes(q) ||
      (qDigits.length >= 3 && digitsOf(m.phone).includes(qDigits)),
  );
}

/** Chat partners first (they carry online status), then contacts not already listed. */
export function mergeNewChatPeople(partners: NewChatPerson[], contacts: MatchedUser[], myId: string): NewChatPerson[] {
  const seen = new Set(partners.map((p) => p.id));
  const out = [...partners];
  for (const c of contacts) {
    if (c.user_id === myId || seen.has(c.user_id)) continue;
    seen.add(c.user_id);
    out.push({
      id: c.user_id,
      display_name: c.display_name,
      avatar_url: c.avatar_url,
      is_online: false,
      last_seen_at: "",
      show_last_seen: false,
    });
  }
  return out.sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? ""));
}
