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
const CUSTOM_KEY = "chichat:ringtone:custom"; // details only: { name, size, type, savedAt }
export const DEFAULT_RINGTONE: BuiltInRingtoneId = "melody-marimba";

/** Largest audio file accepted as a ringtone. */
export const MAX_CUSTOM_RINGTONE_BYTES = 50 * 1024 * 1024;

/**
 * The user's own ringtone. Its details live in localStorage; the audio itself
 * lives in IndexedDB, which (unlike localStorage, a few MB at most) can hold
 * files up to MAX_CUSTOM_RINGTONE_BYTES.
 */
export type CustomRingtone = { name: string; size: number; type: string; savedAt: number };

const DB_NAME = "chichat-ringtones";
const DB_STORE = "files";
const DB_KEY = "custom";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(blob, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function dbGet(): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_KEY);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

async function dbDelete(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export function getCustomRingtone(): CustomRingtone | null {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.name && typeof parsed?.size === "number") return parsed as CustomRingtone;
  } catch {
    /* ignore */
  }
  return null;
}

/** Saves the user's audio file as their ringtone (replacing any earlier one). */
export async function saveCustomRingtone(file: File): Promise<CustomRingtone> {
  await dbPut(file);
  const meta: CustomRingtone = {
    name: file.name,
    size: file.size,
    type: file.type || "audio",
    savedAt: Date.now(),
  };
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(meta));
  forgetCachedUrl();
  return meta;
}

export async function removeCustomRingtone(): Promise<void> {
  try {
    localStorage.removeItem(CUSTOM_KEY);
  } catch {
    /* ignore */
  }
  forgetCachedUrl();
  await dbDelete().catch(() => {});
}

/** Whether the saved audio is still on this device. */
export async function hasCustomRingtoneFile(): Promise<boolean> {
  try {
    return !!(await dbGet());
  } catch {
    return false;
  }
}

let cachedUrl: string | null = null;
function forgetCachedUrl() {
  if (cachedUrl) URL.revokeObjectURL(cachedUrl);
  cachedUrl = null;
}

/** A playable address for the saved audio, kept ready so a call rings at once. */
export async function loadCustomRingtoneUrl(): Promise<string | null> {
  if (cachedUrl) return cachedUrl;
  try {
    const blob = await dbGet();
    if (!blob) return null;
    cachedUrl = URL.createObjectURL(blob);
    return cachedUrl;
  } catch {
    return null;
  }
}

/**
 * Ringtones picked before files moved to IndexedDB were saved inside
 * localStorage as text ({ name, dataUrl }). Move such a file once.
 */
async function migrateOldCustomRingtone() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.dataUrl || !parsed?.name) return;
    const blob = await (await fetch(parsed.dataUrl)).blob();
    await dbPut(blob);
    const meta: CustomRingtone = { name: parsed.name, size: blob.size, type: blob.type || "audio", savedAt: Date.now() };
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(meta));
  } catch {
    /* keep the old copy; nothing else depends on it */
  }
}

if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
  void migrateOldCustomRingtone().then(() => {
    if (getCustomRingtone()) void loadCustomRingtoneUrl();
  });
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
  if (!getCustomRingtone()) return playRingtone(DEFAULT_RINGTONE, maxSeconds);
  let stopped = false;
  let audio: HTMLAudioElement | null = null;
  let fallbackStop: StopFn | null = null;
  let autoStop: number | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (autoStop) window.clearTimeout(autoStop);
    fallbackStop?.();
    try {
      audio?.pause();
    } catch {
      /* ignore */
    }
  };
  if (maxSeconds && maxSeconds > 0) {
    autoStop = window.setTimeout(() => stop(), maxSeconds * 1000);
  }
  void loadCustomRingtoneUrl().then((url) => {
    if (stopped) return;
    // The file is gone from this device: ring with the default instead.
    if (!url) {
      fallbackStop = playRingtone(DEFAULT_RINGTONE);
      return;
    }
    audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.9;
    audio.play().catch(() => {
      /* autoplay may fail before priming */
    });
  });
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

/** 16-bit mono WAV file from rendered samples. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * One cycle of a built-in ringtone as a WAV file, so the phone app can ring
 * with it (looped) while ChiChat is closed or the phone is locked.
 */
export async function renderRingtoneWav(id: BuiltInRingtoneId): Promise<Blob> {
  const pattern = PATTERNS[id] ?? PATTERNS[DEFAULT_RINGTONE];
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(pattern.cycle * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  pattern.render(ctx as unknown as AudioContext, master, 0.02);
  const rendered = await ctx.startRendering();
  const samples = rendered.getChannelData(0);
  // As loud as a phone ringtone: bring the loudest point up to 90%.
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak > 0) {
    const gain = 0.9 / peak;
    for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  }
  return encodeWav(samples, sampleRate);
}

/** The audio file of the selected ringtone (null: the saved file is gone). */
export async function selectedRingtoneFile(): Promise<{ blob: Blob; ext: string; key: string } | null> {
  const id = getSelectedRingtone();
  if (id.startsWith("custom:")) {
    const meta = getCustomRingtone();
    const blob = await dbGet().catch(() => null);
    if (!meta || !blob) return null;
    const ext = (meta.name.includes(".") ? meta.name.split(".").pop() : "") || "audio";
    return { blob, ext: ext.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "audio", key: `custom:${meta.savedAt}` };
  }
  return { blob: await renderRingtoneWav(id as BuiltInRingtoneId), ext: "wav", key: id };
}
