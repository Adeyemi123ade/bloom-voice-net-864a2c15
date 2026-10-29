import { useEffect, useRef } from "react";

/** What the CALLER hears before the call connects. */
export type CallerTone = "calling" | "ringing" | null;

/**
 * Tones for the CALLER (the one dialing), made with WebAudio (no files, and
 * the caller has just tapped Call, so the browser lets it play):
 *   "calling": the call is on its way, the other phone hasn't rung yet;
 *              "tom tom", then about 3 s quiet, repeating
 *   "ringing": the other phone is ringing; classic ringback,
 *              2 s tone, 4 s quiet
 *   null:      silence (connected, ended, or not the caller)
 * One sound source for the whole call: moving from calling to ringing
 * switches the pattern at once, with no gap.
 */
export function useRingback(tone: CallerTone) {
  const toneRef = useRef<CallerTone>(tone);
  toneRef.current = tone;
  // Starts the current pattern now (set while a call's tones are on).
  const restartRef = useRef<(() => void) | null>(null);

  const active = tone !== null;

  useEffect(() => {
    if (!active) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext;
    try {
      ctx = new AC();
    } catch {
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    let playing: GainNode[] = [];

    const beep = (startAt: number, freqs: number[], length: number, level: number) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, startAt);
      g.gain.linearRampToValueAtTime(level, startAt + 0.03);
      g.gain.setValueAtTime(level, startAt + length - 0.05);
      g.gain.linearRampToValueAtTime(0, startAt + length);
      g.connect(ctx.destination);
      playing.push(g);
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.connect(g);
        o.start(startAt);
        o.stop(startAt + length + 0.02);
      }
    };

    // One cycle of the current pattern, then the next one is scheduled.
    const cycle = () => {
      if (cancelled) return;
      playing = [];
      const now = ctx.currentTime;
      if (toneRef.current === "ringing") {
        beep(now, [400, 450], 2.0, 0.18);
        timer = window.setTimeout(cycle, 6000);
      } else {
        beep(now, [440], 0.16, 0.12);
        beep(now + 0.34, [440], 0.16, 0.12);
        timer = window.setTimeout(cycle, 3500);
      }
    };

    restartRef.current = () => {
      if (cancelled) return;
      if (timer) window.clearTimeout(timer);
      // Cut whatever is sounding, then start the new pattern.
      for (const g of playing) {
        try {
          g.disconnect();
        } catch {
          /* already finished */
        }
      }
      cycle();
    };

    ctx.resume().catch(() => undefined).finally(cycle);

    return () => {
      cancelled = true;
      restartRef.current = null;
      if (timer) window.clearTimeout(timer);
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
    };
  }, [active]);

  // Calling → ringing: the ringback starts now, not after the current pause.
  const prev = useRef<CallerTone>(tone);
  useEffect(() => {
    const was = prev.current;
    prev.current = tone;
    if (was === "calling" && tone === "ringing") restartRef.current?.();
  }, [tone]);
}
