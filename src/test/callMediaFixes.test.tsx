import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Fakes for everything outside the call screen ─────────────────────────
type Fn = (...a: unknown[]) => void;
class Emitter {
  handlers = new Map<string, Set<Fn>>();
  on(e: string, f: Fn) { if (!this.handlers.has(e)) this.handlers.set(e, new Set()); this.handlers.get(e)!.add(f); return this; }
  once(e: string, f: Fn) { const w: Fn = (...a) => { this.off(e, w); f(...a); }; return this.on(e, w); }
  off(e: string, f: Fn) { this.handlers.get(e)?.delete(f); return this; }
  emit(e: string, ...a: unknown[]) { [...(this.handlers.get(e) ?? [])].forEach((f) => f(...a)); }
}

const w = vi.hoisted(() => ({
  // filled in below (classes can't be hoisted)
  made: { audio: [] as unknown[], video: [] as unknown[] },
  failVideo: null as null | Error,
  failAudio: null as null | Error,
  rooms: [] as unknown[],
  sent: [] as { event: string; payload: unknown }[],
  broadcast: new Map<string, (m: { payload: unknown }) => void>(),
  native: false,
  route: { speaker: false, headset: false, bluetooth: false, inCall: true },
  routeListener: null as null | ((r: unknown) => void),
  setSpeakerCalls: [] as boolean[],
  oldApp: false,
}));

function makeLocal(kind: "audio" | "video") {
  const t = Object.assign(new Emitter(), {
    kind,
    isEnabled: true,
    isStopped: false,
    mediaStreamTrack: { id: `${kind}-${Math.random()}` },
    enable() { t.isEnabled = true; t.emit("enabled", t); },
    disable() { t.isEnabled = false; t.emit("disabled", t); },
    stop() { t.isStopped = true; t.emit("stopped", t); },
    attach() { const el = document.createElement("video"); el.dataset.kind = `local-${kind}`; return el; },
    detach() { return []; },
  });
  return t;
}
type Local = ReturnType<typeof makeLocal>;

function makeRemoteVideo() {
  const t = Object.assign(new Emitter(), {
    kind: "video",
    isEnabled: true,
    attach() { const el = document.createElement("video"); el.dataset.kind = "remote-video"; return el; },
    detach() { return []; },
  });
  return t;
}

function makeRoom(tracks: Local[]) {
  const peer = Object.assign(new Emitter(), { identity: "peer", tracks: new Map() });
  const room = Object.assign(new Emitter(), {
    participants: new Map([["peer", peer]]),
    published: [...tracks] as Local[],
    peer,
    localParticipant: {
      publishTrack: async (t: Local) => { room.published.push(t); },
      unpublishTrack: (t: Local) => { room.published = room.published.filter((x) => x !== t); },
    },
    disconnect() { return room; },
  });
  return room;
}
type FakeRoom = ReturnType<typeof makeRoom>;

vi.mock("twilio-video", () => ({
  createLocalAudioTrack: async () => {
    if (w.failAudio) throw w.failAudio;
    const t = makeLocal("audio"); w.made.audio.push(t); return t;
  },
  createLocalVideoTrack: async () => {
    if (w.failVideo) throw w.failVideo;
    const t = makeLocal("video"); w.made.video.push(t); return t;
  },
}));
vi.mock("@/lib/callEngine", () => ({
  connectCall: async (_name: string, _tok: unknown, tracks: Local[]) => { const r = makeRoom(tracks); w.rooms.push(r); return r; },
  roomNeedsTwilioSetup: () => false,
}));
vi.mock("@/lib/callToken", () => ({ getCallToken: async () => "tok", prefetchCallToken: () => {}, renewCallToken: async () => "tok" }));
vi.mock("@/lib/callMedia", () => ({
  clearPreparedCallMedia: () => {},
  formatCallMediaError: () => "Camera or microphone not available",
  startPreparingCallMedia: () => Promise.resolve(),
  takePreparedCallMedia: async () => null,
}));
vi.mock("@/lib/nativeCalls", () => ({
  startCallForegroundService: async () => {},
  stopCallForegroundService: async () => {},
  isAndroidNative: () => w.native,
}));
vi.mock("@/lib/audioRoute", async () => {
  class SpeakerUnsupportedError extends Error {}
  return {
    SpeakerUnsupportedError,
    initialSpeakerSupport: () => (w.native ? "native" : "none"),
    getAudioRoute: async () => { if (w.oldApp) throw new SpeakerUnsupportedError("update"); return { ...w.route }; },
    setLoudspeaker: async (on: boolean) => {
      if (w.oldApp) throw new SpeakerUnsupportedError("update");
      w.setSpeakerCalls.push(on);
      w.route.speaker = on;
      return { ...w.route };
    },
    onAudioRouteChange: (fn: (r: unknown) => void) => { w.routeListener = fn; return () => { w.routeListener = null; }; },
  };
});
vi.mock("@/lib/callTimeline", () => ({ markCall: () => {}, startCallTimeline: () => {} }));
vi.mock("@/lib/pushNotify", () => ({ pushCallCancelled: () => {} }));
vi.mock("@/lib/accountStatus", () => ({ requestAccountCheck: () => {} }));
vi.mock("@/lib/callStart", () => ({ saveNewCall: async () => ({}) }));
vi.mock("@/hooks/useRingback", () => ({ useRingback: () => {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false, signedOut: false }) }));
vi.mock("@/components/MobileFrame", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const k of ["select", "update", "insert", "eq", "in", "neq", "is", "order", "limit"]) q[k] = self;
    q.maybeSingle = async () => ({ data: { id: "call-1", status: "accepted" }, error: null });
    q.single = q.maybeSingle;
    q.then = (res: (v: unknown) => void) => res({ data: null, error: null });
    return q;
  };
  const channel = () => {
    const ch = {
      on: (type: string, filter: { event?: string }, cb: (m: { payload: unknown }) => void) => {
        if (type === "broadcast" && filter.event) w.broadcast.set(filter.event, cb);
        return ch;
      },
      subscribe: () => ch,
      send: async (m: { event: string; payload: unknown }) => { w.sent.push({ event: m.event, payload: m.payload }); return "ok"; },
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
import { Toaster } from "@/components/ui/toaster";

const params = {
  conversationId: "conv-1",
  callId: "call-1",
  roomName: "ag-room",
  role: "callee" as const,
  initialIsVideo: false,
  peer: { name: "Bola", avatarUrl: null },
};

async function startCall() {
  render(
    <MemoryRouter initialEntries={["/call/conv-1"]}>
      <CallSession params={params as never} />
      <Toaster />
    </MemoryRouter>,
  );
  await waitFor(() => expect(w.rooms.length).toBe(1));
  await waitFor(() => expect(screen.getByRole("button", { name: "End call" })).toBeInTheDocument());
  return w.rooms[0] as FakeRoom;
}
const room = () => w.rooms[w.rooms.length - 1] as FakeRoom;
const fromPeer = async (event: string, payload: unknown = {}) => {
  await act(async () => { w.broadcast.get(event)?.({ payload }); await Promise.resolve(); });
};
const peerVideoOn = async (r: FakeRoom) => {
  const v = makeRemoteVideo();
  await act(async () => { r.peer.emit("trackSubscribed", v); });
  return v;
};
const pip = () => document.querySelector('[data-testid="video-pip"]') as HTMLElement | null;
const stage = () => document.querySelector('[data-testid="video-stage"]') as HTMLElement | null;
const videosOn = (r: FakeRoom) => r.published.filter((t) => t.kind === "video" && !t.isStopped);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("chichat:language", "en");
  w.made = { audio: [], video: [] };
  w.failVideo = null;
  w.failAudio = null;
  w.rooms = [];
  w.sent = [];
  w.broadcast = new Map();
  w.native = false;
  w.oldApp = false;
  w.route = { speaker: false, headset: false, bluetooth: false, inCall: true };
  w.setSpeakerCalls = [];
  w.routeListener = null;
});
afterEach(() => { vi.useRealTimers(); });

describe("audio call switched to video", () => {
  it("they ask, I accept: my preview and their video both show", async () => {
    const r = await startCall();
    await fromPeer("video-upgrade-request");
    fireEvent.click(await screen.findByText("Accept"));
    await waitFor(() => expect(videosOn(r)).toHaveLength(1));
    expect(w.sent.find((m) => m.event === "video-upgrade-response")?.payload).toMatchObject({ accepted: true });
    await waitFor(() => expect(pip()?.querySelector('[data-kind="local-video"]')).toBeTruthy());
    expect(pip()!.style.visibility).not.toBe("hidden");
    await peerVideoOn(r);
    await waitFor(() => expect(stage()?.querySelector('[data-kind="remote-video"]')).toBeTruthy());
  });

  it("I ask, they accept: my preview and their video both show", async () => {
    const r = await startCall();
    fireEvent.click(screen.getByLabelText("Switch to video call"));
    expect(w.sent.map((m) => m.event)).toContain("video-upgrade-request");
    await fromPeer("video-upgrade-response", { accepted: true });
    await waitFor(() => expect(videosOn(r)).toHaveLength(1));
    await waitFor(() => expect(pip()?.querySelector('[data-kind="local-video"]')).toBeTruthy());
    await peerVideoOn(r);
    await waitFor(() => expect(stage()?.querySelector('[data-kind="remote-video"]')).toBeTruthy());
  });

  it("both ask at the same moment: video turns on once, both sides told yes", async () => {
    const r = await startCall();
    fireEvent.click(screen.getByLabelText("Switch to video call"));
    await fromPeer("video-upgrade-request");
    await fromPeer("video-upgrade-response", { accepted: true });
    await waitFor(() => expect(videosOn(r)).toHaveLength(1));
    await new Promise((res) => setTimeout(res, 50));
    expect(w.made.video).toHaveLength(1);
    expect(w.sent.filter((m) => m.event === "video-upgrade-response").map((m) => m.payload)).toEqual([
      expect.objectContaining({ accepted: true }),
    ]);
  });

  it("my camera can't start: their video still shows, no empty preview, and the video button starts mine without asking again", async () => {
    const r = await startCall();
    w.failVideo = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    await fromPeer("video-upgrade-request");
    fireEvent.click(await screen.findByText("Accept"));
    await peerVideoOn(r);
    await waitFor(() => expect(stage()?.querySelector('[data-kind="remote-video"]')).toBeTruthy());
    expect(pip()?.style.visibility).toBe("hidden");
    // Try again: camera works now. No new question to them.
    w.failVideo = null;
    const before = w.sent.filter((m) => m.event === "video-upgrade-request").length;
    fireEvent.click(screen.getByLabelText("Switch to video call"));
    await waitFor(() => expect(videosOn(r)).toHaveLength(1));
    expect(w.sent.filter((m) => m.event === "video-upgrade-request").length).toBe(before);
    await waitFor(() => expect(pip()?.querySelector('[data-kind="local-video"]')).toBeTruthy());
  });

  it("their camera switched off: no frozen picture; back on: shown again", async () => {
    const r = await startCall();
    await fromPeer("video-upgrade-request");
    fireEvent.click(await screen.findByText("Accept"));
    const remote = await peerVideoOn(r);
    await waitFor(() => expect(stage()?.querySelector('[data-kind="remote-video"]')).toBeTruthy());
    await act(async () => { remote.isEnabled = false; remote.emit("disabled", remote); });
    await waitFor(() => expect(stage()?.querySelector('[data-kind="remote-video"]')).toBeFalsy());
    await act(async () => { remote.isEnabled = true; remote.emit("enabled", remote); });
    await waitFor(() => expect(stage()?.querySelector('[data-kind="remote-video"]')).toBeTruthy());
  });

  it("no answer to my request: the question is taken off their screen too", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await startCall();
    fireEvent.click(screen.getByLabelText("Switch to video call"));
    await act(async () => { vi.advanceTimersByTime(20_500); });
    expect(w.sent.map((m) => m.event)).toContain("video-upgrade-cancel");
  });

  it("connection lost after switching to video: joining again sends the camera too", async () => {
    const r = await startCall();
    await fromPeer("video-upgrade-request");
    fireEvent.click(await screen.findByText("Accept"));
    await waitFor(() => expect(videosOn(r)).toHaveLength(1));
    const camera = videosOn(r)[0];
    await act(async () => { r.emit("disconnected", r, { code: 0 }); });
    await waitFor(() => expect(w.rooms.length).toBe(2), { timeout: 4000 });
    expect(room().published).toContain(camera);
    expect(room().published.some((t) => t.kind === "audio")).toBe(true);
  });

  it("the camera stops by itself mid-call: a new one is started and sent", async () => {
    const r = await startCall();
    await fromPeer("video-upgrade-request");
    fireEvent.click(await screen.findByText("Accept"));
    await waitFor(() => expect(videosOn(r)).toHaveLength(1));
    await act(async () => { videosOn(r)[0].stop(); });
    await waitFor(() => expect(w.made.video).toHaveLength(2));
    await waitFor(() => expect(videosOn(r)).toContain(w.made.video[1]));
  });
});

describe("microphone", () => {
  it("mute switches the real microphone off and on, and the button says so", async () => {
    const r = await startCall();
    const mic = r.published.find((t) => t.kind === "audio")!;
    fireEvent.click(screen.getByLabelText("Mute"));
    expect(mic.isEnabled).toBe(false);
    expect(screen.getByLabelText("Unmute")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByLabelText("Unmute"));
    expect(mic.isEnabled).toBe(true);
  });

  it("microphone stops by itself: a new one is sent, still muted if it was", async () => {
    const r = await startCall();
    fireEvent.click(screen.getByLabelText("Mute"));
    const mic = r.published.find((t) => t.kind === "audio")!;
    await act(async () => { mic.stop(); });
    await waitFor(() => expect(w.made.audio).toHaveLength(2));
    const next = w.made.audio[1] as Local;
    await waitFor(() => expect(r.published).toContain(next));
    expect(next.isEnabled).toBe(false);
  });

  it("microphone can't come back: the call goes on, shown as muted with a plain message", async () => {
    const r = await startCall();
    w.failAudio = Object.assign(new Error("gone"), { name: "NotReadableError" });
    const mic = r.published.find((t) => t.kind === "audio")!;
    await act(async () => { mic.stop(); });
    await waitFor(() => expect(screen.getByLabelText("Unmute")).toBeInTheDocument());
    expect(await screen.findByText("Your microphone stopped. You're muted for now.")).toBeInTheDocument();
  });
});

describe("loudspeaker", () => {
  it("website: no loudspeaker button that can't do anything", async () => {
    await startCall();
    expect(screen.queryByLabelText(/Speaker (on|off)/)).toBeNull();
  });

  it("Android: voice call on the earpiece; the button switches the real route and shows what Android reports", async () => {
    w.native = true;
    await startCall();
    await waitFor(() => expect(screen.getByLabelText("Speaker off")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Speaker off"));
    await waitFor(() => expect(screen.getByLabelText("Speaker on")).toBeInTheDocument());
    expect(w.setSpeakerCalls).toEqual([true]);
    fireEvent.click(screen.getByLabelText("Speaker on"));
    await waitFor(() => expect(screen.getByLabelText("Speaker off")).toBeInTheDocument());
    expect(w.setSpeakerCalls).toEqual([true, false]);
  });

  it("Android: switching to video turns the loudspeaker on, but not with a headset in", async () => {
    w.native = true;
    const r = await startCall();
    await fromPeer("video-upgrade-request");
    fireEvent.click(await screen.findByText("Accept"));
    await waitFor(() => expect(videosOn(r)).toHaveLength(1));
    await waitFor(() => expect(screen.getByLabelText("Speaker on")).toBeInTheDocument());
  });

  it("Android: with a headset connected, video stays on the headset", async () => {
    w.native = true;
    w.route.headset = true;
    const r = await startCall();
    await fromPeer("video-upgrade-request");
    fireEvent.click(await screen.findByText("Accept"));
    await waitFor(() => expect(videosOn(r)).toHaveLength(1));
    await new Promise((res) => setTimeout(res, 30));
    expect(w.setSpeakerCalls).not.toContain(true);
    expect(screen.getByLabelText("Speaker off")).toBeInTheDocument();
  });

  it("Android: headset plugged in during the call: the button follows the real route", async () => {
    w.native = true;
    await startCall();
    fireEvent.click(await screen.findByLabelText("Speaker off"));
    await waitFor(() => expect(screen.getByLabelText("Speaker on")).toBeInTheDocument());
    await act(async () => { w.routeListener?.({ speaker: false, headset: true, bluetooth: false, inCall: true }); });
    expect(screen.getByLabelText("Speaker off")).toBeInTheDocument();
  });

  it("Android app built before this: the button says to update, never pretends", async () => {
    w.native = true;
    w.oldApp = true;
    await startCall();
    await waitFor(() => expect(screen.getByLabelText("Speaker off")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Speaker off"));
    expect(await screen.findByText("Update the ChiChat app to use the loudspeaker.")).toBeInTheDocument();
    expect(screen.getByLabelText("Speaker off")).toBeInTheDocument();
  });
});
