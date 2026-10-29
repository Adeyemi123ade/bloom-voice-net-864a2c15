import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRingback, type CallerTone } from "@/hooks/useRingback";

// A stand-in for the browser's audio engine: records every tone started.
const audio = vi.hoisted(() => ({ tones: [] as number[][], contexts: 0, closed: 0 }));
class FakeContext {
  currentTime = 0;
  destination = {};
  constructor() {
    audio.contexts++;
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    audio.closed++;
    return Promise.resolve();
  }
  createGain() {
    const g = { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {}, freqs: [] as number[] };
    return g;
  }
  createOscillator() {
    const o = {
      type: "sine",
      frequency: { value: 0 },
      connect: () => {},
      start: () => audio.tones.push([o.frequency.value]),
      stop: () => {},
    };
    return o;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  audio.tones = [];
  audio.contexts = 0;
  audio.closed = 0;
  vi.stubGlobal("AudioContext", FakeContext);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("what the caller hears", () => {
  it("Calling…: a soft double pip, repeating", async () => {
    renderHook(() => useRingback("calling"));
    await flush();
    expect(audio.tones).toEqual([[440], [440]]);
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(audio.tones.length).toBe(4);
  });

  it("switches to the ringback the moment the other phone rings, on the same sound source", async () => {
    const { rerender } = renderHook(({ t }: { t: CallerTone }) => useRingback(t), {
      initialProps: { t: "calling" as CallerTone },
    });
    await flush();
    audio.tones = [];
    rerender({ t: "ringing" });
    await flush();
    expect(audio.tones).toEqual([[400], [450]]);
    expect(audio.contexts).toBe(1);
    // ringback cadence: next ring 6 s later
    await act(async () => {
      vi.advanceTimersByTime(5900);
    });
    expect(audio.tones.length).toBe(2);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(audio.tones.length).toBe(4);
  });

  it("goes quiet when the call connects or ends", async () => {
    const { rerender } = renderHook(({ t }: { t: CallerTone }) => useRingback(t), {
      initialProps: { t: "ringing" as CallerTone },
    });
    await flush();
    rerender({ t: null });
    await flush();
    expect(audio.closed).toBe(1);
    const before = audio.tones.length;
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    expect(audio.tones.length).toBe(before);
  });

  it("plays nothing for the person being called", async () => {
    renderHook(() => useRingback(null));
    await flush();
    expect(audio.contexts).toBe(0);
  });
});
