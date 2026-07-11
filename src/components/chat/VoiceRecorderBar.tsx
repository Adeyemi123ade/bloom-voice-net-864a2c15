import { useEffect, useRef, useState } from "react";

const BAR_COUNT = 27;
const MIN_H = 4;
const MAX_H = 28;

/**
 * Live, audio-reactive waveform for the in-progress recording — reads real
 * amplitude off the same MediaStream MediaRecorder is capturing (via a
 * separate AnalyserNode tapped off the stream, not interfering with the
 * recording itself). Bars scroll left as new amplitude samples come in, the
 * same "live voice note" look WhatsApp uses, rather than a static timer.
 */
export function VoiceRecorderBar({ stream }: { stream: MediaStream | null }) {
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(MIN_H));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream) return;
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const history: number[] = Array(BAR_COUNT).fill(MIN_H);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length; // 0-255 loudness for this frame
      const height = Math.max(MIN_H, Math.min(MAX_H, Math.round((avg / 255) * MAX_H)));
      history.push(height);
      history.shift();
      setLevels([...history]);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      ctx.close().catch(() => { /* already closed */ });
    };
  }, [stream]);

  return (
    <div className="flex-1 flex items-center gap-[2px] h-9 min-w-0" aria-hidden>
      {levels.map((h, i) => (
        <span
          key={i}
          className="flex-1 min-w-[2px] rounded-full bg-destructive/70"
          style={{ height: `${h}px` }}
        />
      ))}
    </div>
  );
}
