/**
 * Centralized presence/last-seen formatting and privacy.
 *
 * Rules (from product spec):
 * - Online means is_online === true AND last_seen_at within the last 5 minutes
 * - Otherwise show "last seen HH:MM" if today, "yesterday" if yesterday, else date
 * - Reciprocal privacy: if I hide my last seen, I cannot see anyone else's either.
 *   The other party's last seen is also hidden if they have it disabled.
 */

const FIVE_MIN_MS = 5 * 60 * 1000;

export type PresenceProfile = {
  is_online: boolean;
  last_seen_at: string;
  show_last_seen?: boolean | null;
};

export function isReallyOnline(p: PresenceProfile): boolean {
  if (!p.is_online) return false;
  const age = Date.now() - new Date(p.last_seen_at).getTime();
  return age < FIVE_MIN_MS;
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatLastSeen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = fmtClock(d);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `last seen ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `last seen yesterday ${time}`;
  return `last seen ${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

/**
 * Returns the string to display for the other user's presence,
 * honouring reciprocal privacy.
 *  - mySettingsAllow: do *I* share my last seen? If not, I see nothing.
 *  - other.show_last_seen: does the other user share theirs? If not, I see nothing.
 */
export function presenceLabel(
  other: PresenceProfile | null | undefined,
  mySettingsAllow: boolean,
): string {
  if (!other) return "";
  if (isReallyOnline(other)) return "online";
  if (!mySettingsAllow) return "";
  if (other.show_last_seen === false) return "";
  return formatLastSeen(other.last_seen_at);
}
