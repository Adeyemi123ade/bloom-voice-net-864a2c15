/**
 * Built-in ringtone library — generated entirely with WebAudio so we ship no
 * audio assets. 20 varied presets across Melody / Classic / Modern / Playful.
 * Users can also pick any audio file from their device (stored as data URL).
 */

export type BuiltInRingtoneId =
  | "melody-marimba"
  | "melody-chime"
  | "melody-pluck"
  | "melody-arpeggio"
  | "melody-music-box"
  | "melody-twinkle"
  | "melody-zen"
  | "melody-hopeful"
  | "classic-twotone"
  | "classic-trill"
  | "classic-old-phone"
  | "classic-bell"
  | "classic-uk"
  | "modern-digital"
  | "modern-blip"
  | "modern-pulse"
  | "modern-radar"
  | "playful-bounce"
  | "playful-skip"
  | "playful-happy";

export type RingtoneId = BuiltInRingtoneId | `custom:${string}`;

export type RingtonePreset = {
  id: BuiltInRingtoneId;
  label: string;
  category: "Melody" | "Classic" | "Modern" | "Playful";
  description: string;
};

export const RINGTONES: RingtonePreset[] = [
  { id: "melody-marimba", label: "Marimba", category: "Melody", description: "Warm wooden arpeggio" },
  { id: "melody-chime", label: "Chime", category: "Melody", description: "Gentle bell sequence" },
  { id: "melody-pluck", label: "Harp pluck", category: "Melody", description: "Soft plucked strings" },
  { id: "melody-arpeggio", label: "Arpeggio", category: "Melody", description: "Rising major chord" },
  { id: "melody-music-box", label: "Music box", category: "Melody", description: "Delicate lullaby" },
  { id: "melody-twinkle", label: "Twinkle", category: "Melody", description: "Sparkling stars" },
  { id: "melody-zen", label: "Zen", category: "Melody", description: "Calm meditation tones" },
  { id: "melody-hopeful", label: "Hopeful", category: "Melody", description: "Bright uplifting motif" },
  { id: "classic-twotone", label: "Classic two-tone", category: "Classic", description: "Familiar phone ring" },
  { id: "classic-trill", label: "Classic trill", category: "Classic", description: "Traditional dual-tone" },
  { id: "classic-old-phone", label: "Old phone", category: "Classic", description: "Vintage rotary feel" },
  { id: "classic-bell", label: "School bell", category: "Classic", description: "Bright metallic bell" },
  { id: "classic-uk", label: "UK ring", category: "Classic", description: "British telephone" },
  { id: "modern-digital", label: "Digital", category: "Modern", description: "Crisp synth notes" },
  { id: "modern-blip", label: "Blip", category: "Modern", description: "Quick synthetic beep" },
  { id: "modern-pulse", label: "Pulse", category: "Modern", description: "Rhythmic electronic" },
  { id: "modern-radar", label: "Radar", category: "Modern", description: "Sweeping sci-fi tone" },
  { id: "playful-bounce", label: "Bounce", category: "Playful", description: "Cheery jumping notes" },
  { id: "playful-skip", label: "Skip", category: "Playful", description: "Light skipping rhythm" },
  { id: "playful-happy", label: "Happy", category: "Playful", description: "Joyful little tune" },
];

const STORAGE_KEY = "chichat:ringtone";
const CUSTOM_KEY = "chichat:ringtone:custom"; // { name, dataUrl }
export const DEFAULT_RINGTONE: BuiltInRingtoneId = "melody-marimba";

export type CustomRingtone = { name: string; dataUrl: string };

export function getCustomRingtone(): CustomRingtone | null {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.name && parsed?.dataUrl) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function setCustomRingtone(c: CustomRingtone | null) {
  try {
    if (c) localStorage.setItem(CUSTOM_KEY, JSON.stringify(c));
    else localStorage.removeItem(CUSTOM_KEY);
  } catch {
    /* ignore */
  }
}

export function getSelectedRingtone(): RingtoneId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "custom" && getCustomRingtone()) return "custom:user";
    if (v && RINGTONES.some((r) => r.id === v)) return v as RingtoneId;
  } catch {
    /* ignore */
  }
  return DEFAULT_RINGTONE;
}

export function setSelectedRingtone(id: RingtoneId) {
  try {
    if (id.startsWith("custom:")) localStorage.setItem(STORAGE_KEY, "custom");
    else localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

type StopFn = () => void;

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

function playSweep(
  ctx: AudioContext,
  destination: AudioNode,
  fromFreq: number,
  toFreq: number,
  startAt: number,
  duration: number,
  type: OscillatorType = "sine",
  peak = 0.18,
) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(fromFreq, startAt);
  o.frequency.linearRampToValueAtTime(toFreq, startAt + duration);
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(peak, startAt + 0.05);
  g.gain.linearRampToValueAtTime(0, startAt + duration);
  o.connect(g);
  g.connect(destination);
  o.start(startAt);
  o.stop(startAt + duration + 0.05);
}

type Pattern = {
  cycle: number;
  render: (ctx: AudioContext, dest: AudioNode, startAt: number) => void;
};

const N = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98, A6: 1760.0,
};

const PATTERNS: Record<BuiltInRingtoneId, Pattern> = {
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
  "melody-arpeggio": {
    cycle: 3.5,
    render: (ctx, dest, t0) => {
      const seq = [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, N.E6, N.C6];
      seq.forEach((f, i) => playNote(ctx, dest, f, t0 + i * 0.18, 0.4, "triangle", 0.2));
    },
  },
  "melody-music-box": {
    cycle: 5.0,
    render: (ctx, dest, t0) => {
      const seq = [N.G5, N.E5, N.C5, N.E5, N.G5, N.C6, N.G5, N.E5];
      seq.forEach((f, i) => playNote(ctx, dest, f, t0 + i * 0.3, 0.55, "sine", 0.18));
    },
  },
  "melody-twinkle": {
    cycle: 4.5,
    render: (ctx, dest, t0) => {
      const seq = [N.C5, N.C5, N.G5, N.G5, N.A5, N.A5, N.G5];
      seq.forEach((f, i) => playNote(ctx, dest, f, t0 + i * 0.32, 0.45, "sine", 0.2));
    },
  },
  "melody-zen": {
    cycle: 6.0,
    render: (ctx, dest, t0) => {
      playNote(ctx, dest, N.D5, t0, 2.2, "sine", 0.22);
      playNote(ctx, dest, N.A5, t0 + 0.6, 2.0, "sine", 0.18);
      playNote(ctx, dest, N.F5, t0 + 1.6, 2.4, "sine", 0.16);
    },
  },
  "melody-hopeful": {
    cycle: 4.5,
    render: (ctx, dest, t0) => {
      const seq = [N.F5, N.A5, N.C6, N.F6, N.C6, N.A5];
      seq.forEach((f, i) => playNote(ctx, dest, f, t0 + i * 0.24, 0.5, "triangle", 0.22));
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
  "classic-old-phone": {
    cycle: 5.5,
    render: (ctx, dest, t0) => {
      // Two short bursts of 25Hz-modulated tone
      for (let burst = 0; burst < 2; burst++) {
        const start = t0 + burst * 1.6;
        for (let i = 0; i < 30; i++) {
          playNote(ctx, dest, 950, start + i * 0.04, 0.03, "sine", 0.12);
        }
      }
    },
  },
  "classic-bell": {
    cycle: 4.0,
    render: (ctx, dest, t0) => {
      for (let i = 0; i < 4; i++) {
        playNote(ctx, dest, N.A5, t0 + i * 0.55, 0.5, "triangle", 0.22);
        playNote(ctx, dest, N.E6, t0 + i * 0.55 + 0.02, 0.5, "sine", 0.16);
      }
    },
  },
  "classic-uk": {
    cycle: 6.0,
    render: (ctx, dest, t0) => {
      playDualTone(ctx, dest, 400, 450, t0, 0.4, 0.22);
      playDualTone(ctx, dest, 400, 450, t0 + 0.6, 0.4, 0.22);
      playDualTone(ctx, dest, 400, 450, t0 + 2.0, 0.4, 0.22);
      playDualTone(ctx, dest, 400, 450, t0 + 2.6, 0.4, 0.22);
    },
  },
  "modern-digital": {
    cycle: 3.5,
    render: (ctx, dest, t0) => {
      const seq = [N.C6, N.E6, N.G6, N.E6];
      for (let r = 0; r < 2; r++) {
        seq.forEach((f, i) =>
          playNote(ctx, dest, f, t0 + r * 1.5 + i * 0.16, 0.25, "square", 0.14),
        );
      }
    },
  },
  "modern-blip": {
    cycle: 3.0,
    render: (ctx, dest, t0) => {
      for (let i = 0; i < 6; i++) {
        playNote(ctx, dest, 1200, t0 + i * 0.2, 0.08, "square", 0.16);
      }
    },
  },
  "modern-pulse": {
    cycle: 3.5,
    render: (ctx, dest, t0) => {
      for (let i = 0; i < 8; i++) {
        playNote(ctx, dest, i % 2 === 0 ? N.A5 : N.E6, t0 + i * 0.18, 0.12, "sawtooth", 0.14);
      }
    },
  },
  "modern-radar": {
    cycle: 4.5,
    render: (ctx, dest, t0) => {
      playSweep(ctx, dest, 600, 1400, t0, 0.6, "sine", 0.18);
      playSweep(ctx, dest, 600, 1400, t0 + 1.0, 0.6, "sine", 0.18);
      playSweep(ctx, dest, 600, 1400, t0 + 2.0, 0.6, "sine", 0.18);
    },
  },
  "playful-bounce": {
    cycle: 3.5,
    render: (ctx, dest, t0) => {
      const seq = [N.C5, N.G5, N.C5, N.G5, N.E5, N.C6, N.G5, N.E5];
      seq.forEach((f, i) => playNote(ctx, dest, f, t0 + i * 0.18, 0.22, "triangle", 0.2));
    },
  },
  "playful-skip": {
    cycle: 3.5,
    render: (ctx, dest, t0) => {
      const seq = [N.E5, N.G5, N.E5, N.A5, N.E5, N.G5, N.C6];
      seq.forEach((f, i) => playNote(ctx, dest, f, t0 + i * 0.2, 0.26, "triangle", 0.2));
    },
  },
  "playful-happy": {
    cycle: 4.0,
    render: (ctx, dest, t0) => {
      const seq = [N.C5, N.E5, N.G5, N.E5, N.A5, N.G5, N.E5, N.C5];
      seq.forEach((f, i) => playNote(ctx, dest, f, t0 + i * 0.22, 0.32, "sine", 0.22));
    },
  },
};

/** Plays a custom (user-uploaded) ringtone via HTMLAudioElement, looping. */
function playCustom(maxSeconds?: number): StopFn {
  const c = getCustomRingtone();
  if (!c) return () => {};
  const audio = new Audio(c.dataUrl);
  audio.loop = true;
  audio.volume = 0.9;
  let stopped = false;
  audio.play().catch(() => {
    /* autoplay may fail before priming */
  });
  let autoStop: number | undefined;
  if (maxSeconds && maxSeconds > 0) {
    autoStop = window.setTimeout(() => stop(), maxSeconds * 1000);
  }
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (autoStop) window.clearTimeout(autoStop);
    try {
      audio.pause();
      audio.src = "";
    } catch {
      /* ignore */
    }
  };
  return stop;
}

/** Plays the given ringtone in a loop until the returned stop fn is called. */
export function playRingtone(id: RingtoneId, maxSeconds?: number): StopFn {
  if (id.startsWith("custom:")) return playCustom(maxSeconds);

  const ctx = getCtx();
  if (!ctx) return () => {};
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const pattern =
    PATTERNS[id as BuiltInRingtoneId] ?? PATTERNS[DEFAULT_RINGTONE];
  let cancelled = false;
  let timer: number | undefined;
  const activeNodes: AudioNode[] = [master];

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
  };

  return stop;
}
