// How long each step of a call takes on this phone, from the tap. Logged to
// the console ("[call-timing]") and kept for the last call so the Call setup
// page can show it: real numbers from a real phone instead of guesses.

export type CallStage =
  | "tap" // Call or Accept tapped
  | "screen" // call screen on screen
  | "media" // microphone (and camera) ready
  | "saved" // call saved, the other phone can be told
  | "push" // ring push sent
  | "room" // call room ready
  | "token" // permission to join the call received
  | "joined" // this phone joined the call
  | "connected"; // both people are on the call

type Timeline = { callId: string; role: "caller" | "callee"; start: number; marks: Partial<Record<CallStage, number>> };

const KEY = "chichat:last-call-timing";
let current: Timeline | null = null;

export function startCallTimeline(callId: string, role: "caller" | "callee"): void {
  current = { callId, role, start: performance.now(), marks: { tap: 0 } };
  save();
}

export function markCall(callId: string, stage: CallStage): void {
  if (!current || current.callId !== callId || current.marks[stage] !== undefined) return;
  const ms = Math.round(performance.now() - current.start);
  current.marks[stage] = ms;
  console.info(`[call-timing] ${current.role} ${stage} +${ms}ms`);
  save();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ role: current?.role, marks: current?.marks, at: Date.now() }));
  } catch { /* ignore */ }
}

export type SavedTimeline = { role?: "caller" | "callee"; marks?: Partial<Record<CallStage, number>>; at?: number };

export function lastCallTimeline(): SavedTimeline | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedTimeline) : null;
  } catch {
    return null;
  }
}
