import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The call screen with everything outside it faked: a call room where the
// test decides when the other person arrives, and the saved call status the
// test decides when to report (through the realtime listener or the poll).
type Fn = (...a: unknown[]) => void;
class Emitter {
  handlers = new Map<string, Set<Fn>>();
  on(e: string, f: Fn) { if (!this.handlers.has(e)) this.handlers.set(e, new Set()); this.handlers.get(e)!.add(f); return this; }
  once(e: string, f: Fn) { const w: Fn = (...a) => { this.off(e, w); f(...a); }; return this.on(e, w); }
  off(e: string, f: Fn) { this.handlers.get(e)?.delete(f); return this; }
  emit(e: string, ...a: unknown[]) { [...(this.handlers.get(e) ?? [])].forEach((f) => f(...a)); }
}

const w = vi.hoisted(() => ({
  rooms: [] as unknown[],
  dbStatus: "ringing",
  // Every realtime "calls" listener ever registered, oldest first.
  statusListeners: [] as ((p: { new: { status: string } }) => void)[],
  pollGate: null as null | (() => void),
  holdPoll: false,
  // When the other phone said it rings (calls.callee_ringing_at).
  ringingAt: "2026-10-26T10:00:00Z" as string | null,
}));

function makeTrack(kind: "audio" | "video") {
  const t = Object.assign(new Emitter(), {
    kind, isEnabled: true, isStopped: false, mediaStreamTrack: { id: kind },
    enable() { t.isEnabled = true; }, disable() { t.isEnabled = false; },
    stop() { t.isStopped = true; t.emit("stopped", t); },
    attach() { return document.createElement("video"); }, detach() { return []; },
  });
  return t;
}
function makeRoom() {
  const room = Object.assign(new Emitter(), {
    participants: new Map<string, unknown>(),
    localParticipant: { publishTrack: async () => {}, unpublishTrack: () => {} },
    disconnect() { return room; },
    /** The other person joins the room. */
    arrive() {
      const p = Object.assign(new Emitter(), { identity: "peer", tracks: new Map() });
      room.participants.set("peer", p);
      room.emit("participantConnected", p);
    },
  });
  return room;
}
type FakeRoom = ReturnType<typeof makeRoom>;

vi.mock("twilio-video", () => ({
  createLocalAudioTrack: async () => makeTrack("audio"),
  createLocalVideoTrack: async () => makeTrack("video"),
}));
vi.mock("@/lib/callEngine", () => ({
  connectCall: async () => { const r = makeRoom(); w.rooms.push(r); return r; },
  roomNeedsTwilioSetup: () => false,
}));
vi.mock("@/lib/callToken", () => ({ getCallToken: async () => "tok", prefetchCallToken: () => {}, renewCallToken: async () => "tok" }));
vi.mock("@/lib/callMedia", () => ({
  clearPreparedCallMedia: () => {},
  formatCallMediaError: () => "x",
  startPreparingCallMedia: () => Promise.resolve(),
  takePreparedCallMedia: async () => null,
}));
vi.mock("@/lib/nativeCalls", () => ({
  startCallForegroundService: async () => {},
  stopCallForegroundService: async () => {},
  isAndroidNative: () => false,
}));
vi.mock("@/lib/callTimeline", () => ({ markCall: () => {}, startCallTimeline: () => {} }));
vi.mock("@/lib/pushNotify", () => ({ pushCallCancelled: () => {} }));
vi.mock("@/lib/accountStatus", () => ({ requestAccountCheck: () => {} }));
vi.mock("@/lib/callStart", () => ({ saveNewCall: async () => ({ result: "saved" }) }));
vi.mock("@/hooks/useRingback", () => ({ useRingback: () => {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false, signedOut: false }) }));
vi.mock("@/components/MobileFrame", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const k of ["select", "update", "insert", "eq", "in", "neq", "is", "order", "limit"]) q[k] = self;
    q.maybeSingle = async () => {
      // The poll's answer can be held back to land after other events.
      if (w.holdPoll) await new Promise<void>((res) => { w.pollGate = res; });
      return { data: { id: "call-1", status: w.dbStatus, callee_ringing_at: w.ringingAt }, error: null };
    };
    q.single = q.maybeSingle;
    q.then = (res: (v: unknown) => void) => res({ data: null, error: null });
    return q;
  };
  const channel = () => {
    const ch = {
      on: (type: string, _f: unknown, cb: (p: { new: { status: string } }) => void) => {
        if (type === "postgres_changes") w.statusListeners.push(cb);
        return ch;
      },
      subscribe: () => ch,
      send: async () => "ok",
    };
    return ch;
  };
  return {
    supabase: {
      from: () => chain(),
      channel,
      removeChannel: () => {},
      functions: { invoke: async () => ({ data: null, error: null }) },
      rpc: async () => ({ data: null, error: null }),
    },
  };
});
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
HTMLMediaElement.prototype.pause = function () {};

import CallSession from "@/pages/CallScreen";

const callerParams = (video: boolean) => ({
  conversationId: "conv-1",
  callId: "call-1",
  roomName: "ag-room",
  role: "caller" as const,
  initialIsVideo: video,
  peer: { name: "Bola", avatarUrl: null },
  setup: { calleeId: "bola" },
});

async function startRinging(video = false) {
  render(
    <MemoryRouter initialEntries={["/call/conv-1"]}>
      <CallSession params={callerParams(video) as never} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(w.rooms.length).toBe(1)); // joined while ringing
  await waitFor(() => expect(screen.getByText("Ringing…")).toBeInTheDocument());
  return w.rooms[0] as FakeRoom;
}
const shows = (text: RegExp | string) => screen.queryByText(text) !== null;
const timer = /^\d{2}:\d{2}$/;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("chichat:language", "en");
  w.rooms = [];
  w.dbStatus = "ringing";
  w.statusListeners = [];
  w.pollGate = null;
  w.holdPoll = false;
  w.ringingAt = "2026-10-26T10:00:00Z";
});

describe("call status after the other person answers", () => {
  for (const video of [false, true]) {
    const kind = video ? "video" : "voice";

    it(`${kind}: they arrive first, then the late "accepted" from an earlier listener: stays connected`, async () => {
      const room = await startRinging(video);
      const earliest = w.statusListeners[0]; // registered while it rang
      await act(async () => { room.arrive(); });
      await waitFor(() => expect(shows("Connecting…")).toBe(false));
      w.dbStatus = "accepted";
      await act(async () => { earliest({ new: { status: "accepted" } }); });
      await new Promise((r) => setTimeout(r, 50));
      expect(shows("Connecting…")).toBe(false);
      await waitFor(() => expect(screen.getAllByText(timer).length).toBeGreaterThan(0));
    });

    it(`${kind}: the status poll answers "accepted" after they arrived: stays connected`, async () => {
      const room = await startRinging(video);
      // A poll that went out while it rang, answered late.
      w.holdPoll = true;
      await waitFor(() => expect(w.pollGate).not.toBeNull(), { timeout: 2000 });
      w.holdPoll = false;
      await act(async () => { room.arrive(); });
      w.dbStatus = "accepted";
      await act(async () => { w.pollGate?.(); await new Promise((r) => setTimeout(r, 20)); });
      await new Promise((r) => setTimeout(r, 450));
      expect(shows("Connecting…")).toBe(false);
      await waitFor(() => expect(screen.getAllByText(timer).length).toBeGreaterThan(0));
    });

    it(`${kind}: "accepted" first, then they arrive: Connecting, then connected`, async () => {
      const room = await startRinging(video);
      w.dbStatus = "accepted";
      await act(async () => { w.statusListeners[w.statusListeners.length - 1]({ new: { status: "accepted" } }); });
      await waitFor(() => expect(shows("Connecting…")).toBe(true));
      await act(async () => { room.arrive(); });
      await waitFor(() => expect(shows("Connecting…")).toBe(false));
      await waitFor(() => expect(screen.getAllByText(timer).length).toBeGreaterThan(0));
    });
  }
});

describe("caller: Calling until the other phone rings", () => {
  it("shows Calling… while unconfirmed, then Ringing… once the other phone reports it", async () => {
    w.ringingAt = null;
    render(
      <MemoryRouter initialEntries={["/call/conv-1"]}>
        <CallSession params={callerParams(false) as never} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(w.rooms.length).toBe(1));
    await waitFor(() => expect(screen.getAllByText("Calling…").length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 500));
    expect(shows("Ringing…")).toBe(false);
    expect(screen.getByTestId("call-avatar").getAttribute("data-ringing")).toBe("false");
    // Their phone reports ringing (realtime update).
    w.ringingAt = "2026-10-26T10:00:02Z";
    await act(async () => {
      w.statusListeners[w.statusListeners.length - 1]({ new: { status: "ringing", callee_ringing_at: w.ringingAt } as never });
    });
    await waitFor(() => expect(shows("Ringing…")).toBe(true));
    expect(screen.getByTestId("call-avatar").getAttribute("data-ringing")).toBe("true");
  });
});

describe("how the call ended is shown in the call's status line, not a pop-up", () => {
  it("declined: the status line says Call declined", async () => {
    await startRinging(false);
    w.dbStatus = "declined";
    await act(async () => {
      w.statusListeners[w.statusListeners.length - 1]({ new: { status: "declined" } });
    });
    await waitFor(() => expect(shows("Call declined")).toBe(true));
    expect(shows("Ringing…")).toBe(false);
  });

  it("connected then hung up by the other person: Call ended with the length", async () => {
    const room = await startRinging(false);
    w.dbStatus = "accepted";
    await act(async () => { w.statusListeners[w.statusListeners.length - 1]({ new: { status: "accepted" } }); });
    await act(async () => { room.arrive(); });
    await waitFor(() => expect(screen.getAllByText(timer).length).toBeGreaterThan(0));
    w.dbStatus = "ended";
    await act(async () => { w.statusListeners[w.statusListeners.length - 1]({ new: { status: "ended" } }); });
    await waitFor(() => expect(shows(/^Call ended · \d{2}:\d{2}$/)).toBe(true));
  });
});
