import { tNow, appLocale } from "@/lib/i18n/language";
/**
 * Centralized presence/last-seen formatting and privacy.
 *
 * Rules (from product spec):
 * - Online means is_online === true AND last_seen_at within the last 5 minutes
 * - Otherwise show "last seen HH:MM" in 24-hour format only
 * - Reciprocal privacy: if I hide my last seen, I cannot see anyone else's either.
 *   The other party's last seen is also hidden if they have it disabled.
 */

const FIVE_MIN_MS = 5 * 60 * 1000;

export type PresenceProfile = {
  is_online: boolean;
  last_seen_at: string;
  show_last_seen?: boolean | null;
};

export function isReallyOnline(p: PresenceProfile | null | undefined): boolean {
  if (!p || !p.is_online) return false;
  const age = Date.now() - new Date(p.last_seen_at).getTime();
  return age < FIVE_MIN_MS;
}

function fmtClock(d: Date): string {
  return new Intl.DateTimeFormat(appLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatLastSeen(iso: string): string {
  const d = new Date(iso);
  return tNow("presence.lastSeen", { time: fmtClock(d) });
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
  if (isReallyOnline(other)) return tNow("common.online");
  if (!mySettingsAllow) return "";
  if (other.show_last_seen === false) return "";
  return formatLastSeen(other.last_seen_at);
}
