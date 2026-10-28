import type { MatchedUser } from "@/components/contacts/contactsHelpers";

/**
 * Which of my phone contacts are on ChiChat, as found last time, kept on this
 * device so the Contacts screen shows them at once while the check runs
 * again in the background. One copy per account; cleared on sign-out.
 */
const PREFIX = "chichat:contacts:matched:v1:";

export type CallStat = { call_count: number; last_called_at: string | null };

export type MatchCache = {
  /** Phone numbers that were checked, so an unchanged phone book isn't checked twice. */
  phonesKey: string;
  matches: MatchedUser[];
  stats: [string, CallStat][];
  /** When the whole list was last checked with ChiChat (ms). */
  checkedAt?: number;
};

/**
 * How long a check of the whole phone book stays good. Opening Contacts or
 * New chat again within this time uses it instead of sending every number
 * again (a 7,000-number phone book was being sent several times an hour).
 * A changed phone book, an import, or Refresh checks at once.
 */
export const MATCH_FRESH_MS = 30 * 60 * 1000;

/** The saved check covers exactly these numbers and is recent enough to reuse. */
export function isFreshFor(cache: MatchCache | null, key: string, now = Date.now()): boolean {
  return !!cache && cache.phonesKey === key && !!cache.checkedAt && now - cache.checkedAt < MATCH_FRESH_MS;
}

export function phonesKey(phones: string[]): string {
  // Short fingerprint of the sorted list (order of the phone book doesn't matter).
  const s = [...phones].sort().join(",");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${phones.length}:${(h >>> 0).toString(36)}`;
}

export function loadMatchCache(userId: string): MatchCache | null {
  try {
    const raw = localStorage.getItem(PREFIX + userId);
    if (!raw) return null;
    const c = JSON.parse(raw) as MatchCache;
    return Array.isArray(c?.matches) && Array.isArray(c?.stats) ? c : null;
  } catch {
    return null;
  }
}

export function saveMatchCache(userId: string, cache: MatchCache): void {
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify(cache));
  } catch {
    /* storage full: the screen still works, it just checks from the network */
  }
}

/** On sign-out: other people's names and photos don't stay on the device. */
export function clearMatchCaches(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Runs `work` over `items` in batches, a few batches at a time. */
export async function inBatches<T, R>(
  items: T[],
  size: number,
  parallel: number,
  work: (batch: T[]) => Promise<R[]>,
): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  const out: R[][] = new Array(batches.length);
  let next = 0;
  const lane = async () => {
    while (next < batches.length) {
      const i = next++;
      out[i] = await work(batches[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, batches.length) }, lane));
  return out.flat();
}
