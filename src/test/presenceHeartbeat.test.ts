import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake database call that, like the real one, only goes out when .then() is called.
const sent = vi.hoisted(() => [] as { is_online: boolean; last_seen_at: string; id: string }[]);
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (row: { is_online: boolean; last_seen_at: string }) => ({
        eq: (_col: string, id: string) => ({
          then: (ok: (v: { error: null }) => void) => {
            sent.push({ ...row, id });
            ok({ error: null });
          },
        }),
      }),
    }),
  },
}));

import { HEARTBEAT_MS, startPresence } from "@/lib/presenceHeartbeat";

let visibility: "visible" | "hidden" = "visible";
Object.defineProperty(document, "visibilityState", { get: () => visibility, configurable: true });
const setVisibility = (v: "visible" | "hidden") => {
  visibility = v;
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T22:00:00Z"));
  sent.length = 0;
  visibility = "visible";
});
afterEach(() => vi.useRealTimers());

describe("online status and last seen", () => {
  it("opening the app really sends 'online' with the current time", () => {
    const stop = startPresence("u1");
    expect(sent).toEqual([{ is_online: true, last_seen_at: "2026-10-23T22:00:00.000Z", id: "u1" }]);
    stop();
  });

  it("renews every minute while on screen", () => {
    const stop = startPresence("u1");
    vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    expect(sent.filter((s) => s.is_online)).toHaveLength(4);
    expect(sent.at(-1)!.last_seen_at).toBe("2026-10-23T22:03:00.000Z");
    stop();
  });

  it("app to the background: offline, last seen = that moment; back: online again", () => {
    const stop = startPresence("u1");
    vi.advanceTimersByTime(30_000);
    setVisibility("hidden");
    expect(sent.at(-1)).toMatchObject({ is_online: false, last_seen_at: "2026-10-23T22:00:30.000Z" });
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    expect(sent.at(-1)!.is_online).toBe(false); // no renewals while hidden
    setVisibility("visible");
    expect(sent.at(-1)).toMatchObject({ is_online: true, last_seen_at: "2026-10-23T22:02:30.000Z" });
    stop();
  });

  it("screen flicking on and off doesn't flood the database", () => {
    const stop = startPresence("u1");
    for (let i = 0; i < 5; i++) {
      setVisibility("hidden");
      setVisibility("visible");
      vi.advanceTimersByTime(1_000);
    }
    expect(sent.filter((s) => s.is_online).length).toBeLessThanOrEqual(6);
    stop();
  });

  it("closing the page or signing out stamps last seen and stops", () => {
    const stop = startPresence("u1");
    vi.advanceTimersByTime(5_000);
    window.dispatchEvent(new Event("pagehide"));
    expect(sent.at(-1)).toMatchObject({ is_online: false, last_seen_at: "2026-10-23T22:00:05.000Z" });
    stop();
    const count = sent.length;
    vi.advanceTimersByTime(HEARTBEAT_MS * 5);
    expect(sent.length).toBe(count); // nothing after stopping
  });
});
