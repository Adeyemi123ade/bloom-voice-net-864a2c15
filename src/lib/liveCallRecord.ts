import type { ActiveCallParams } from "@/lib/activeCall";

// The calls this phone is connected to right now, saved on the phone so a
// call can be picked up again if the app reloads or Android restarts it
// (the call itself carries on: the other person waits on "Reconnecting…").
// Only this phone's own calls are kept here, so opening ChiChat on another
// device never joins a call that is running on this one.

const KEY = "chichat.live_calls";
/** A record not refreshed for this long belongs to a call that is over. */
export const LIVE_CALL_FRESH_MS = 60_000;

export type LiveCallRecord = Omit<ActiveCallParams, "setup"> & {
  /** When the call connected (for the call timer after picking it up again). */
  connectedAt: number;
  /** Last time the call was seen running on this phone. */
  at: number;
};

function readAll(): Record<string, LiveCallRecord> {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as Record<string, LiveCallRecord>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, LiveCallRecord>) {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function saveLiveCall(params: ActiveCallParams, connectedAt: number): void {
  const { setup: _setup, ...rest } = params;
  const all = readAll();
  all[params.callId] = { ...rest, connectedAt, at: Date.now() };
  writeAll(all);
}

export function touchLiveCall(callId: string): void {
  const all = readAll();
  if (!all[callId]) return;
  all[callId].at = Date.now();
  writeAll(all);
}

export function clearLiveCall(callId: string): void {
  const all = readAll();
  if (!all[callId]) return;
  delete all[callId];
  writeAll(all);
}

/** Calls this phone was connected to a moment ago (stale ones are dropped). */
export function freshLiveCalls(): LiveCallRecord[] {
  const all = readAll();
  const now = Date.now();
  const fresh: Record<string, LiveCallRecord> = {};
  for (const [id, r] of Object.entries(all)) {
    if (r && now - r.at < LIVE_CALL_FRESH_MS) fresh[id] = r;
  }
  if (Object.keys(fresh).length !== Object.keys(all).length) writeAll(fresh);
  return Object.values(fresh);
}

export function liveCallRecord(callId: string): LiveCallRecord | null {
  return freshLiveCalls().find((r) => r.callId === callId) ?? null;
}
