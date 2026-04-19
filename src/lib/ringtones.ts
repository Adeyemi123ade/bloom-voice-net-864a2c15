/**
 * Built-in ringtone library — generated entirely with WebAudio so we ship no
 * audio assets. Each ringtone returns a "stop" function. Patterns auto-loop
 * with a short pause until stopped.
 */

export type RingtoneId =
  | "melody-marimba"
  | "melody-chime"
  | "melody-pluck"
  | "classic-twotone"
  | "classic-trill";

export type RingtonePreset = {
  id: RingtoneId;
  label: string;
  category: "Melody" | "Classic";
  description: string;
};

export const RINGTONES: RingtonePreset[] = [
  { id: "melody-marimba", label: "Marimba", category: "Melody", description: "Warm wooden arpeggio" },
  { id: "melody-chime", label: "Chime", category: "Melody", description: "Gentle bell sequence" },
  { id: "melody-pluck", label: "Harp pluck", category: "Melody", description: "Soft plucked strings" },
  { id: "classic-twotone", label: "Classic two-tone", category: "Classic", description: "Familiar phone ring" },
  { id: "classic-trill", label: "Classic trill", category: "Classic", description: "Traditional dual-tone ring" },
];

const STORAGE_KEY = "chichat:ringtone";
export const DEFAULT_RINGTONE: RingtoneId = "melody-marimba";

export function getSelectedRingtone(): RingtoneId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && RINGTONES.some((r) => r.id === v)) return v as RingtoneId;
  } catch {
    /* ignore */
  }
  return DEFAULT_RINGTONE;
}

export function setSelectedRingtone(id: RingtoneId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

type StopFn = () => void;

/**
 * Shared, gesture-primed AudioContext. Browsers (especially mobile Chrome)
 * block AudioContext.resume() unless it was created/resumed during a real
 * user gesture. We create ONE context the first time the user touches the
 * page, immediately resume it, and play a brief silent buffer to fully
 * "unlock" it. After that we can play ringtones at any time without a
 * fresh gesture — including from a Realtime callback.
 */
let sharedCtx: AudioContext | null = null;
let primed = false;

function createCtx(): AudioContext | null {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AC ? new AC() : null;
}

export function primeAudio() {
  if (primed) return;
  if (!sharedCtx) sharedCtx = createCtx();
  if (!sharedCtx) return;
  try {
    void sharedCtx.resume();
    // Play 50ms of silence to unlock iOS / Android Chrome
    const buf = sharedCtx.createBuffer(1, 1, 22050);
    const src = sharedCtx.createBufferSource();
    src.buffer = buf;
    src.connect(sharedCtx.destination);
    src.start(0);
    primed = true;
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  const opts = { capture: true, passive: true } as AddEventListenerOptions;
  const handler = () => {
    primeAudio();
    if (primed) {
      window.removeEventListener("pointerdown", handler, opts);
      window.removeEventListener("touchstart", handler, opts);
      window.removeEventListener("keydown", handler, opts);
      window.removeEventListener("click", handler, opts);
    }
  };
  window.addEventListener("pointerdown", handler, opts);
  window.addEventListener("touchstart", handler, opts);
  window.addEventListener("keydown", handler, opts);
  window.addEventListener("click", handler, opts);
}

function getCtx(): AudioContext | null {
  if (!sharedCtx) sharedCtx = createCtx();
  return sharedCtx;
}

/** Pluck-style envelope: fast attack, exponential decay. */
function playNote(
  ctx: AudioContext,
  destination: AudioNode,
  freq: number,
  startAt: number,
  duration: number,
  type: OscillatorType,
  peak = 0.22,
) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(peak, startAt + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  o.connect(g);
  g.connect(destination);
  o.start(startAt);
  o.stop(startAt + duration + 0.05);
}

function playDualTone(
  ctx: AudioContext,
  destination: AudioNode,
  f1: number,
  f2: number,
  startAt: number,
  duration: number,
  peak = 0.18,
) {
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  o1.frequency.value = f1;
  o2.frequency.value = f2;
  o1.type = "sine";
  o2.type = "sine";
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(peak, startAt + 0.04);
  g.gain.setValueAtTime(peak, startAt + duration - 0.05);
  g.gain.linearRampToValueAtTime(0, startAt + duration);
  o1.connect(g);
  o2.connect(g);
  g.connect(destination);
  o1.start(startAt);
  o2.start(startAt);
  o1.stop(startAt + duration + 0.05);
  o2.stop(startAt + duration + 0.05);
}

type Pattern = {
  cycle: number;
  render: (ctx: AudioContext, dest: AudioNode, startAt: number) => void;
};

const N = {
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
  A5: 880.0, B5: 987.77, C6: 1046.5, E6: 1318.51, G6: 1567.98,
};

const PATTERNS: Record<RingtoneId, Pattern> = {
  "melody-marimba": {
    cycle: 4.0,
    render: (ctx, dest, t0) => {
      const seq = [N.C5, N.E5, N.G5, N.C6, N.G5, N.E5];
      seq.forEach((f, i) => playNote(ctx, dest, f, t0 + i * 0.22, 0.45, "triangle", 0.25));
      playNote(ctx, dest, N.E6, t0 + 1.45, 0.6, "triangle", 0.2);
    },
  },
  "melody-chime": {
    cycle: 4.5,
    render: (ctx, dest, t0) => {
      playNote(ctx, dest, N.E6, t0, 1.4, "sine", 0.28);
      playNote(ctx, dest, N.C6, t0 + 0.45, 1.4, "sine", 0.22);
      playNote(ctx, dest, N.G5, t0 + 0.9, 1.6, "sine", 0.2);
      playNote(ctx, dest, N.C6, t0 + 2.1, 1.2, "sine", 0.18);
    },
  },
  "melody-pluck": {
    cycle: 3.6,
    render: (ctx, dest, t0) => {
      const seq = [N.D5, N.A5, N.D5, N.G5, N.A5, N.E5];
      seq.forEach((f, i) => playNote(ctx, dest, f, t0 + i * 0.18, 0.35, "sawtooth", 0.16));
    },
  },
  "classic-twotone": {
    cycle: 4.0,
    render: (ctx, dest, t0) => playDualTone(ctx, dest, 440, 480, t0, 2.0, 0.22),
  },
  "classic-trill": {
    cycle: 5.0,
    render: (ctx, dest, t0) => {
      playDualTone(ctx, dest, 400, 450, t0, 0.9, 0.22);
      playDualTone(ctx, dest, 400, 450, t0 + 1.1, 0.9, 0.22);
    },
  },
};

/**
 * Plays the given ringtone in a loop until the returned stop fn is called.
 * Uses the shared primed AudioContext so it works even when triggered from
 * a Realtime callback (no fresh user gesture required, as long as the user
 * has tapped the app at least once previously).
 */
export function playRingtone(id: RingtoneId, maxSeconds?: number): StopFn {
  const ctx = getCtx();
  if (!ctx) return () => {};
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const pattern = PATTERNS[id] ?? PATTERNS[DEFAULT_RINGTONE];
  let cancelled = false;
  let timer: number | undefined;
  const activeNodes: AudioNode[] = [master];

  const tick = () => {
    if (cancelled) return;
    pattern.render(ctx, master, ctx.currentTime + 0.05);
    timer = window.setTimeout(tick, pattern.cycle * 1000);
  };

  // Always try to resume — no-op if already running.
  ctx.resume().finally(tick);

  let autoStop: number | undefined;
  if (maxSeconds && maxSeconds > 0) {
    autoStop = window.setTimeout(() => stop(), maxSeconds * 1000);
  }

  const stop = () => {
    if (cancelled) return;
    cancelled = true;
    if (timer) window.clearTimeout(timer);
    if (autoStop) window.clearTimeout(autoStop);
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      try {
        activeNodes.forEach((n) => n.disconnect());
      } catch {
        /* ignore */
      }
    }, 150);
    // Do NOT close the shared ctx — we reuse it for the next call.
  };

  return stop;
}
