// Message rows for the chat room: types, normalising rows from Supabase,
// and the retries for the rare row that arrives with blank content.
// Moved out of src/pages/ChatRoom.tsx unchanged.
import { supabase } from "@/integrations/supabase/client";
import { tNow } from "@/lib/i18n/language";
import { isLimitError, isSuspendedError, requestAccountCheck } from "@/lib/accountStatus";
import { isBlockedError } from "@/lib/safety";

// A row coming from Supabase (initial fetch or realtime payload) is only
// guaranteed to match the DB schema, not this shape — content in particular
// has been observed null on some rows, and every render/handler below calls
// string methods on it directly, which throws (blanking the whole app, no
// error boundary) the instant such a row reaches state. Normalize on the way in.
// A message row's `content` is never legitimately empty — every send path
// (text/voice/attachment) always writes a non-empty, prefixed string before
// insert. If a realtime payload — or an immediate re-fetch of the same row —
// ever comes back with blank content, that's a transient read-after-write
// race (the client observes the row before a lagging connection/replica has
// caught up with the write it was just notified about), not a real state.
// A single-shot re-fetch can still lose that race; retry with backoff so a
// message doesn't get stuck rendering as an empty "timestamp only" bubble
// with delete/copy/forward silently no-op'ing on it until a full reload.
export async function fetchMessageRowWithRetry(
  id: string,
  attempts = 5,
): Promise<Record<string, unknown> | null> {
  for (let i = 0; i < attempts; i++) {
    const { data } = await supabase.from("messages").select("*").eq("id", id).maybeSingle();
    const content = (data as Record<string, unknown> | null)?.content;
    // A message deleted for everyone is empty on purpose: that's final.
    if (data && ((typeof content === "string" && content) || (data as Record<string, unknown>).deleted_for_everyone)) {
      return data as Record<string, unknown>;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  return null;
}

// The realtime INSERT/UPDATE handlers below retry a blank-content row via
// fetchMessageRowWithRetry — but a plain bulk `select("*")` (the initial
// conversation load, and resync() after a reconnect) reads the exact same
// replication-lag-affected rows with no such protection, so a message that
// hasn't finished replicating yet gets normalized straight into a
// blank-content bubble with no retry at all. Apply the same per-row retry
// here so every path that can observe a freshly-inserted row is protected,
// not just the realtime echo. A message's content is never legitimately
// empty (see normalizeMessage above), so this only ever fires for the rare
// lagging row, not on every load.
/**
 * Rows ready to show now, and the rare blank ones that need re-fetching.
 * Showing the list only after those retries (up to about 3 s, more on a
 * slow network) made a chat take seconds to open whenever its latest page
 * held one such message; now they are fixed in the background.
 */
export function splitBlankRows(rows: Record<string, unknown>[]): { ready: Message[]; blank: Record<string, unknown>[] } {
  const blank = rows.filter(
    (r) => !r.deleted_for_everyone && !(typeof r.content === "string" && r.content),
  );
  return { ready: rows.map(normalizeMessage), blank };
}

export async function reconcileBlankRows(rows: Record<string, unknown>[]): Promise<Message[]> {
  const fixed = await Promise.all(
    rows.map(async (row) => {
      if (typeof row.content === "string" && row.content && !row.deleted_for_everyone) {
        return normalizeMessage(row);
      }
      if (row.deleted_for_everyone) return normalizeMessage(row);
      console.warn("[realtime] bulk-fetched row arrived with blank content, retrying", row.id);
      const retried = await fetchMessageRowWithRetry(String(row.id));
      if (retried) return normalizeMessage(retried);
      console.error("[realtime] bulk-fetched row still blank after retries", row.id);
      return normalizeMessage(row);
    }),
  );
  return fixed;
}

/** Messages loaded at a time: the latest page on open, older pages on scroll up. */
export const PAGE_SIZE = 50;

export function normalizeMessage(raw: Record<string, unknown>): Message {
  return {
    id: String(raw.id),
    conversation_id: String(raw.conversation_id),
    sender_id: String(raw.sender_id),
    content: typeof raw.content === "string" ? raw.content : "",
    // String(undefined) is the literal text "undefined", which then fails to
    // parse as a date and renders as "Invalid Date" — fall back to "now"
    // instead of ever handing the UI an unparseable timestamp.
    created_at:
      typeof raw.created_at === "string" && !Number.isNaN(Date.parse(raw.created_at))
        ? raw.created_at
        : new Date().toISOString(),
    delivered_at: (raw.delivered_at as string | null) ?? null,
    read_at: (raw.read_at as string | null) ?? null,
    edited_at: (raw.edited_at as string | null) ?? null,
    deleted_for_everyone: Boolean(raw.deleted_for_everyone),
  };
}

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  edited_at: string | null;
  deleted_for_everyone: boolean;
};

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string;
  show_last_seen?: boolean | null;
};

/** Plain words for why a message couldn't be sent. */
export function sendRefusalText(err: unknown): string {
  if (isBlockedError(err)) return tNow("chat.cantMessage");
  if (isLimitError(err)) return tNow("lim.chats");
  if (isSuspendedError(err)) {
    requestAccountCheck();
    return tNow("chat.cantMessage");
  }
  return tNow("chat.checkConnection");
}
