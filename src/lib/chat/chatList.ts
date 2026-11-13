import { supabase } from "@/integrations/supabase/client";
import { CALL_PREFIX } from "@/lib/chat/format";

/**
 * Data for the chat list (Home), loaded with as little as possible:
 *  - a full load fetches only the latest message of each chat (not every
 *    message, as it used to) and runs its queries in parallel;
 *  - afterwards, realtime changes update the one chat they belong to, and a
 *    presence update just patches that person, with no query at all.
 */

export type ChatProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string;
  show_last_seen?: boolean | null;
};

export type ChatRow = {
  conversation_id: string;
  other: ChatProfile;
  last_message: string | null;
  last_message_id: string | null;
  last_sender_id: string | null;
  last_message_at: string;
  /** Messages from the other person you haven't read yet (call records excluded). */
  unread: number;
};

export type MessageLike = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  read_at?: string | null;
  deleted_for_everyone?: boolean | null;
};

type LastMessage = { id: string; content: string; created_at: string; sender_id: string };

const PROFILE_COLUMNS = "id, display_name, avatar_url, is_online, last_seen_at, show_last_seen";
const LAST_COLUMNS = "id, conversation_id, content, created_at, sender_id";

/** Counts toward the unread badge: from the other person, unread, a real message. */
export function countsAsUnread(m: MessageLike, myId: string): boolean {
  return (
    m.sender_id !== myId &&
    !m.read_at &&
    !m.deleted_for_everyone &&
    !(m.content ?? "").startsWith(CALL_PREFIX)
  );
}

/** Times compared by value, not text (formats can differ between sources). */
const ms = (t: string | null | undefined) => (t ? Date.parse(t) || 0 : 0);

/** Newest first, the order the list shows. */
export function sortChats(rows: ChatRow[]): ChatRow[] {
  return [...rows].sort((a, b) => ms(b.last_message_at) - ms(a.last_message_at));
}

/** Latest message of one chat that wasn't deleted for everyone. */
async function latestMessage(conversationId: string): Promise<LastMessage | null> {
  const { data } = await supabase
    .from("messages")
    .select(LAST_COLUMNS)
    .eq("conversation_id", conversationId)
    .not("deleted_for_everyone", "is", true)
    .order("created_at", { ascending: false })
    .limit(1);
  const m = data?.[0];
  return m ? { id: m.id, content: m.content, created_at: m.created_at, sender_id: m.sender_id } : null;
}

async function unreadCount(conversationId: string, myId: string): Promise<number> {
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .neq("sender_id", myId)
    .is("read_at", null)
    .not("deleted_for_everyone", "is", true)
    .not("content", "like", `${CALL_PREFIX}%`);
  return count ?? 0;
}

/** Fresh preview and badge for one chat (after an edit, delete or read). */
export async function loadChatSummary(
  conversationId: string,
  myId: string,
): Promise<Pick<ChatRow, "last_message" | "last_message_id" | "last_sender_id" | "unread"> & { last_message_at?: string }> {
  const [last, unread] = await Promise.all([latestMessage(conversationId), unreadCount(conversationId, myId)]);
  return {
    last_message: last?.content ?? null,
    last_message_id: last?.id ?? null,
    last_sender_id: last?.sender_id ?? null,
    last_message_at: last?.created_at,
    unread,
  };
}

/** The whole list. */
export async function loadChatList(myId: string): Promise<ChatRow[]> {
  const { data: parts } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", myId);
  const convIds = (parts ?? []).map((p) => p.conversation_id as string);
  if (convIds.length === 0) return [];

  const [{ data: convs }, { data: others }] = await Promise.all([
    supabase.from("conversations").select("id, last_message_at").in("id", convIds),
    supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds)
      .neq("user_id", myId),
  ]);

  const otherIds = Array.from(new Set((others ?? []).map((o) => o.user_id as string)));
  // Each chat's time is set to its newest message's time by a database
  // trigger, so asking for messages at exactly those times returns just the
  // latest message of each chat, in one query.
  const times = Array.from(new Set((convs ?? []).map((c) => c.last_message_at as string).filter(Boolean)));

  const [{ data: profiles }, { data: lastRows }, { data: unreadRows }] = await Promise.all([
    otherIds.length
      ? supabase.from("profiles").select(PROFILE_COLUMNS).in("id", otherIds)
      : Promise.resolve({ data: [] as ChatProfile[] }),
    times.length
      ? supabase
          .from("messages")
          .select(LAST_COLUMNS)
          .in("conversation_id", convIds)
          .in("created_at", times)
          .not("deleted_for_everyone", "is", true)
      : Promise.resolve({ data: [] as (LastMessage & { conversation_id: string })[] }),
    // Only the ids of unread messages (usually few), to count per chat.
    supabase
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", convIds)
      .neq("sender_id", myId)
      .is("read_at", null)
      .not("deleted_for_everyone", "is", true)
      .not("content", "like", `${CALL_PREFIX}%`),
  ]);

  const convTime = new Map((convs ?? []).map((c) => [c.id as string, c.last_message_at as string]));
  const lastByConv = new Map<string, LastMessage>();
  (lastRows ?? []).forEach((m) => {
    // Only the message whose time matches its own chat's time.
    if (ms(convTime.get(m.conversation_id)) !== ms(m.created_at)) return;
    const prev = lastByConv.get(m.conversation_id);
    if (!prev || prev.id < m.id) lastByConv.set(m.conversation_id, m);
  });
  // Chats where that didn't find it (latest one deleted for everyone, an
  // empty chat, or an older chat whose time was never set): ask for each.
  const missing = convIds.filter((id) => !lastByConv.has(id));
  const found = await Promise.all(missing.map((id) => latestMessage(id)));
  missing.forEach((id, i) => {
    const m = found[i];
    if (m) lastByConv.set(id, m);
  });

  const unreadByConv = new Map<string, number>();
  (unreadRows ?? []).forEach((r) =>
    unreadByConv.set(r.conversation_id as string, (unreadByConv.get(r.conversation_id as string) ?? 0) + 1),
  );
  const profById = new Map((profiles ?? []).map((p) => [p.id as string, p as ChatProfile]));
  const otherByConv = new Map<string, string>();
  (others ?? []).forEach((o) => otherByConv.set(o.conversation_id as string, o.user_id as string));

  const rows: ChatRow[] = [];
  convIds.forEach((id) => {
    const other = profById.get(otherByConv.get(id) ?? "");
    if (!other) return;
    const lm = lastByConv.get(id);
    rows.push({
      conversation_id: id,
      other,
      last_message: lm?.content ?? null,
      last_message_id: lm?.id ?? null,
      last_sender_id: lm?.sender_id ?? null,
      last_message_at: lm?.created_at ?? convTime.get(id) ?? new Date(0).toISOString(),
      unread: unreadByConv.get(id) ?? 0,
    });
  });
  return sortChats(rows);
}

/**
 * A new message arrived: update its chat in place. Returns null when the
 * chat isn't in the list (a new conversation), so the caller reloads.
 */
export function applyNewMessage(rows: ChatRow[], m: MessageLike, myId: string): ChatRow[] | null {
  const i = rows.findIndex((r) => r.conversation_id === m.conversation_id);
  if (i === -1) return null;
  if (m.deleted_for_everyone) return rows;
  const row = rows[i];
  // Already in the list (the chat loaded with it, or the same event came twice):
  // counting it again would leave the badge higher than the real unread count.
  if (row.last_message_id === m.id) return rows;
  const newer = ms(m.created_at) >= ms(row.last_message_at);
  const next = rows.slice();
  next[i] = {
    ...row,
    ...(newer
      ? { last_message: m.content ?? "", last_message_id: m.id, last_sender_id: m.sender_id, last_message_at: m.created_at }
      : {}),
    unread: row.unread + (countsAsUnread(m, myId) ? 1 : 0),
  };
  return newer ? sortChats(next) : next;
}

/** Someone's profile changed (online, last seen, name, photo): patch it in. */
export function applyProfile(rows: ChatRow[], p: Partial<ChatProfile> & { id: string }): ChatRow[] {
  let changed = false;
  const next = rows.map((r) => {
    if (r.other.id !== p.id) return r;
    changed = true;
    return { ...r, other: { ...r.other, ...p } };
  });
  return changed ? next : rows;
}

/**
 * Whether an edited message can change what the list shows. Receipts on
 * my own older messages (delivered, read) can't, and are the most common
 * update by far, so they're skipped.
 */
export function updateMatters(rows: ChatRow[], m: MessageLike, myId: string): boolean {
  const row = rows.find((r) => r.conversation_id === m.conversation_id);
  if (!row) return false;
  if (m.sender_id !== myId) return true; // could change the unread count
  return row.last_message_id === m.id || !!m.deleted_for_everyone;
}
