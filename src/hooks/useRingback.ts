import { useEffect, useRef } from "react";

/**
 * Classic phone ringback tone for the CALLER (the one dialing).
 * Plays a "brrring brrring … pause" pattern using WebAudio while `active` is true.
 * No external assets, no autoplay issues (caller already tapped the call button).
 */
export function useRingback(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    ctxRef.current = ctx;
    let cancelled = false;

    // One "brrring": 400Hz + 450Hz dual tone for ~1s, then 200ms gap, repeat,
    // then ~3s silence (classic UK/intl ringback cadence ~ 2on / 4off).
    const playRing = (startAt: number) => {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      o1.frequency.value = 400;
      o2.frequency.value = 450;
      o1.type = "sine";
      o2.type = "sine";
      g.gain.setValueAtTime(0, startAt);
      g.gain.linearRampToValueAtTime(0.18, startAt + 0.05);
      g.gain.setValueAtTime(0.18, startAt + 1.9);
      g.gain.linearRampToValueAtTime(0, startAt + 2.0);
      o1.connect(g);
      o2.connect(g);
      g.connect(ctx.destination);
      o1.start(startAt);
      o2.start(startAt);
      o1.stop(startAt + 2.05);
      o2.stop(startAt + 2.05);
    };

    const loop = () => {
      if (cancelled) return;
      const now = ctx.currentTime;
      playRing(now);
      // 2s tone + 4s silence = 6s cadence
      window.setTimeout(loop, 6000);
    };

    ctx.resume().finally(loop);

    stopRef.current = () => {
      cancelled = true;
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    };

    return () => {
      stopRef.current?.();
      stopRef.current = null;
      ctxRef.current = null;
    };
  }, [active]);
}
