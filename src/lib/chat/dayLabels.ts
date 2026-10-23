// Day labels for the chat timeline: the date pills between days and the
// floating date shown while scrolling.

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar day of a timestamp, e.g. "2026-10-13". Used to group messages. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole calendar days from `key` to `now` (0 = today, 1 = yesterday). Not thrown off by clock changes. */
function daysAgo(key: string, now: Date): number {
  const [y, m, d] = key.split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / 86_400_000);
}

/**
 * "Today", "Yesterday", a weekday for the last week ("Wednesday"), otherwise
 * the full date ("13 October 2026"). Same rules as the familiar chat apps.
 */
export function dayLabel(
  key: string,
  opts: { today: string; yesterday: string; locale: string | string[] },
  now: Date = new Date(),
): string {
  const ago = daysAgo(key, now);
  if (ago === 0) return opts.today;
  if (ago === 1) return opts.yesterday;
  const [y, m, d] = key.split("-").map(Number);
  // Midday, so no time zone can move it to another day.
  const date = new Date(y, m - 1, d, 12);
  try {
    if (ago > 1 && ago < 7) return date.toLocaleDateString(opts.locale, { weekday: "long" });
    return date.toLocaleDateString(opts.locale, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return key;
  }
}
