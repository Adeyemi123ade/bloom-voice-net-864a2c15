/**
 * The last messages of each chat, kept on this device, so a chat opens at
 * once with what was there last time (like WhatsApp) while the latest
 * messages load. Cleared on sign-out.
 */
const PREFIX = "chichat:chatcache:";
const MAX_MESSAGES = 50;

export type CachedChat<M, P> = { other: P | null; messages: M[]; savedAt: number };

export function loadChatCache<M, P>(conversationId: string): CachedChat<M, P> | null {
  try {
    const raw = localStorage.getItem(PREFIX + conversationId);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedChat<M, P>;
    return Array.isArray(c?.messages) ? c : null;
  } catch {
    return null;
  }
}

export function saveChatCache<M extends { id: string }, P>(conversationId: string, other: P | null, messages: M[]): void {
  try {
    // Only messages the server has (not ones still sending).
    const saved = messages.filter((m) => !m.id.startsWith("tmp-")).slice(-MAX_MESSAGES);
    localStorage.setItem(PREFIX + conversationId, JSON.stringify({ other, messages: saved, savedAt: Date.now() }));
  } catch {
    // Storage full or unavailable: the chat still works, it just opens from the network.
  }
}

/** On sign-out, so the next person on this device sees none of it. */
export function clearChatCaches(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * The chat list as last shown, so Chats opens at once while the latest
 * loads. Same prefix as the chats above, so sign-out clears it too.
 */
const LIST_PREFIX = `${PREFIX}list:`;
const MAX_LIST = 200;

export function loadChatListCache<R>(userId: string): R[] | null {
  try {
    const raw = localStorage.getItem(LIST_PREFIX + userId);
    if (!raw) return null;
    const rows = JSON.parse(raw) as R[];
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

export function saveChatListCache<R>(userId: string, rows: R[]): void {
  try {
    localStorage.setItem(LIST_PREFIX + userId, JSON.stringify(rows.slice(0, MAX_LIST)));
  } catch {
    /* storage full: Chats still works, it just opens from the network */
  }
}
