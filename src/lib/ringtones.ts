/**
 * Built-in ringtone library — generated entirely with WebAudio so we ship no
 * audio assets. Each ringtone returns a "stop" function. Patterns auto-loop
 * with a short pause until stopped.
 *
 * 5 presets:
 *   - melody-marimba    : warm marimba arpeggio
 *   - melody-chime      : gentle bell chime sequence
 *   - melody-pluck      : harp-like pluck loop
 *   - classic-twotone   : 440+480 Hz two-tone (US-style ring)
 *   - classic-trill     : 400+450 Hz dual-tone (UK/intl ringback style)
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
  {
    id: "melody-marimba",
    label: "Marimba",
    category: "Melody",
    description: "Warm wooden arpeggio",
  },
  {
    id: "melody-chime",
    label: "Chime",
    category: "Melody",
    description: "Gentle bell sequence",
  },
  {
    id: "melody-pluck",
    label: "Harp pluck",
    category: "Melody",
    description: "Soft plucked strings",
  },
  {
    id: "classic-twotone",
    label: "Classic two-tone",
    category: "Classic",
    description: "Familiar phone ring",
  },
  {
    id: "classic-trill",
    label: "Classic trill",
    category: "Classic",
    description: "Traditional dual-tone ring",
  },
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

function getAC(): AudioContext | null {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  return AC ? new AC() : null;
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

/** Sustained dual-tone segment with soft attack/release. */
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
  /** Length of one full cycle in seconds (tone+gap). */
  cycle: number;
  /** Render one cycle starting at `startAt`. */
  render: (ctx: AudioContext, dest: AudioNode, startAt: number) => void;
};

// Notes (Hz)
const N = {
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
  B5: 987.77,
  C6: 1046.5,
  E6: 1318.51,
  G6: 1567.98,
};

const PATTERNS: Record<RingtoneId, Pattern> = {
  "melody-marimba": {
    cycle: 4.0,
    render: (ctx, dest, t0) => {
      // Bright arpeggio: C5 E5 G5 C6 G5 E5  then pause
      const seq = [N.C5, N.E5, N.G5, N.C6, N.G5, N.E5];
      seq.forEach((f, i) => {
        playNote(ctx, dest, f, t0 + i * 0.22, 0.45, "triangle", 0.25);
      });
      // accent
      playNote(ctx, dest, N.E6, t0 + 1.45, 0.6, "triangle", 0.2);
    },
  },
  "melody-chime": {
    cycle: 4.5,
    render: (ctx, dest, t0) => {
      // Bell-like: E6 C6 G5 — let ring
      playNote(ctx, dest, N.E6, t0, 1.4, "sine", 0.28);
      playNote(ctx, dest, N.C6, t0 + 0.45, 1.4, "sine", 0.22);
      playNote(ctx, dest, N.G5, t0 + 0.9, 1.6, "sine", 0.2);
      playNote(ctx, dest, N.C6, t0 + 2.1, 1.2, "sine", 0.18);
    },
  },
  "melody-pluck": {
    cycle: 3.6,
    render: (ctx, dest, t0) => {
      // Pluck: D5 A5 D5 G5 A5 — rapid
      const seq = [N.D5, N.A5, N.D5, N.G5, N.A5, N.E5];
      seq.forEach((f, i) => {
        playNote(ctx, dest, f, t0 + i * 0.18, 0.35, "sawtooth", 0.16);
      });
    },
  },
  "classic-twotone": {
    cycle: 4.0,
    render: (ctx, dest, t0) => {
      // 2s ring (440+480 Hz), 2s silence
      playDualTone(ctx, dest, 440, 480, t0, 2.0, 0.22);
    },
  },
  "classic-trill": {
    cycle: 5.0,
    render: (ctx, dest, t0) => {
      // brrring brrring: 400+450 Hz, two short tones, then silence
      playDualTone(ctx, dest, 400, 450, t0, 0.9, 0.22);
      playDualTone(ctx, dest, 400, 450, t0 + 1.1, 0.9, 0.22);
    },
  },
};

/**
 * Plays the given ringtone in a loop until the returned stop fn is called.
 * Optionally stops automatically after `maxSeconds` (used for previews).
 */
export function playRingtone(id: RingtoneId, maxSeconds?: number): StopFn {
  const ctx = getAC();
  if (!ctx) return () => {};
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const pattern = PATTERNS[id] ?? PATTERNS[DEFAULT_RINGTONE];
  let cancelled = false;
  let timer: number | undefined;

  const tick = () => {
    if (cancelled) return;
    pattern.render(ctx, master, ctx.currentTime + 0.05);
    timer = window.setTimeout(tick, pattern.cycle * 1000);
  };

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
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    }, 200);
  };

  return stop;
}
