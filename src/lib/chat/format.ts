// Small formatting helpers shared across chat UI.
import { tNow } from "@/lib/i18n/language";
export function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return tNow("time.justNow");
  if (m < 60) return tNow("time.mAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return tNow("time.hAgo", { n: h });
  return tNow("time.dAgo", { n: Math.floor(h / 24) });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

// Per-conversation "delete for me" hidden-id storage.
const HIDE_KEY = (cid: string) => `chichat:hidden:${cid}`;

export function loadHidden(cid: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDE_KEY(cid)) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function saveHidden(cid: string, set: Set<string>) {
  try {
    localStorage.setItem(HIDE_KEY(cid), JSON.stringify(Array.from(set)));
  } catch {
    // Storage can be unavailable/full (e.g. private-browsing quirks) —
    // "Delete for me" already updated in-memory state, so the message stays
    // hidden for this session even if it won't persist across a reload.
  }
}

// Message content prefixes.
export const VOICE_PREFIX = "[voice]";
export const CALL_PREFIX = "[call]"; // [call]video|ended|45  or [call]voice|missed|0
