import { beforeEach, describe, expect, it, vi } from "vitest";

// ── A fake Agora SDK: records calls and lets the test fire its events ──
type Handler = (...args: unknown[]) => void;
const sdk = vi.hoisted(() => {
  const state = {
    handlers: new Map<string, Handler>(),
    published: [] as { muted: boolean; closed: boolean; setMuted: (m: boolean) => Promise<void> }[],
    joined: null as null | unknown[],
    left: 0,
    renewed: [] as string[],
    failJoin: false,
  };
  const makeLocal = () => {
    const t = {
      muted: false,
      closed: false,
      setMuted: async (m: boolean) => { t.muted = m; },
      close: () => { t.closed = true; },
    };
    return t;
  };
  const client = {
    on: (e: string, h: Handler) => { state.handlers.set(e, h); },
    removeAllListeners: () => {},
    join: async (...a: unknown[]) => {
      if (state.failJoin) throw new Error("join failed");
      state.joined = a;
    },
    leave: async () => { state.left++; },
    publish: async (t: (typeof state.published)[number]) => { state.published.push(t); },
    unpublish: async () => {},
    subscribe: async () => {},
    renewToken: async (tok: string) => { state.renewed.push(tok); },
  };
  const AgoraRTC = {
    setLogLevel: () => {},
    disableLogUpload: () => {},
    createClient: () => client,
    createCustomAudioTrack: () => makeLocal(),
    createCustomVideoTrack: () => makeLocal(),
  };
  return { state, AgoraRTC };
});
vi.mock("agora-rtc-sdk-ng", () => ({ default: sdk.AgoraRTC }));

class FakeMediaStream {
  constructor(public tracks: MediaStreamTrack[]) {}
  getTracks() { return this.tracks; }
}
vi.stubGlobal("MediaStream", FakeMediaStream);

const mst = (id: string) => {
  const t = { id, stopped: false, stop() { t.stopped = true; }, clone() { return mst(`${id}-copy`); } };
  return t as unknown as MediaStreamTrack & { stopped: boolean };
};

// A Twilio-style local track (what callMedia.ts makes).
function appTrack(kind: "audio" | "video") {
  const handlers = new Map<string, Set<() => void>>();
  const t = {
    kind,
    isEnabled: true,
    mediaStreamTrack: mst(kind),
    on(e: string, h: () => void) { if (!handlers.has(e)) handlers.set(e, new Set()); handlers.get(e)!.add(h); },
    off(e: string, h: () => void) { handlers.get(e)?.delete(h); },
    disable() { t.isEnabled = false; handlers.get("disabled")?.forEach((h) => h()); },
    enable() { t.isEnabled = true; handlers.get("enabled")?.forEach((h) => h()); },
  };
  return t;
}

const remoteUser = (uid: string) => ({
  uid,
  audioTrack: { getMediaStreamTrack: () => mst(`${uid}-mic`) },
  videoTrack: { getMediaStreamTrack: () => mst(`${uid}-cam`) },
});

const fire = async (e: string, ...args: unknown[]) => {
  await sdk.state.handlers.get(e)?.(...args);
  await new Promise((r) => setTimeout(r, 0));
};

import { connectAgoraRoom } from "@/lib/agoraRoom";
import { engineForRoom, newRoomName, passFunctionFor, readPass, roomNeedsTwilioSetup } from "@/lib/callEngine";

const pass = { appId: "app", token: "tok", uid: "me" };
const connect = (tracks: unknown[] = [appTrack("audio")]) =>
  connectAgoraRoom("ag-room", pass, tracks as never, async () => ({ ...pass, token: "tok2" }));

beforeEach(() => {
  sdk.state.handlers.clear();
  sdk.state.published = [];
  sdk.state.joined = null;
  sdk.state.left = 0;
  sdk.state.renewed = [];
  sdk.state.failJoin = false;
});

describe("call engine choice", () => {
  it("new calls use Agora and the room name says so", () => {
    const name = newRoomName("11111111-2222-3333-4444-555555555555", 1760000000000);
    expect(name.startsWith("ag-")).toBe(true);
    expect(name.length).toBeLessThan(64); // Agora's limit
    expect(engineForRoom(name)).toBe("agora");
    expect(passFunctionFor(name)).toBe("agora-token");
    expect(roomNeedsTwilioSetup(name)).toBe(false);
  });
  it("old Twilio rooms keep using Twilio", () => {
    const name = "chichat-abc-123";
    expect(engineForRoom(name)).toBe("twilio");
    expect(passFunctionFor(name)).toBe("twilio-token");
    expect(roomNeedsTwilioSetup(name)).toBe(true);
    expect(readPass(name, { token: "x" })).toBe("x");
  });
  it("reads an Agora pass and rejects a broken one", () => {
    expect(readPass("ag-1", { appId: "a", token: "t", uid: "u" })).toEqual({ appId: "a", token: "t", uid: "u" });
    expect(readPass("ag-1", { token: "t" })).toBeNull();
  });
});

describe("Agora room", () => {
  it("joins the channel with the pass and sends the microphone", async () => {
    const mic = appTrack("audio");
    await connect([mic]);
    expect(sdk.state.joined).toEqual(["app", "ag-room", "tok", "me"]);
    expect(sdk.state.published).toHaveLength(1);
  });

  it("mute and hold reach the other side; unmute turns it back on", async () => {
    const mic = appTrack("audio");
    await connect([mic]);
    mic.disable();
    expect(sdk.state.published[0].muted).toBe(true);
    mic.enable();
    expect(sdk.state.published[0].muted).toBe(false);
  });

  it("a microphone muted before joining stays muted", async () => {
    const mic = appTrack("audio");
    mic.isEnabled = false;
    await connect([mic]);
    expect(sdk.state.published[0].muted).toBe(true);
  });

  it("the other person arriving and their microphone and camera show up", async () => {
    const room = await connect();
    const arrived = vi.fn();
    room.on("participantConnected", arrived);
    await fire("user-joined", remoteUser("them"));
    expect(arrived).toHaveBeenCalledTimes(1);
    const p = room.participants.get("them")!;
    const subscribed = vi.fn();
    p.on("trackSubscribed", subscribed);
    await fire("user-published", remoteUser("them"), "audio");
    await fire("user-published", remoteUser("them"), "video");
    expect(subscribed).toHaveBeenCalledTimes(2);
    expect(p.tracks.size).toBe(2);
  });

  it("someone already in the call is in participants right after joining", async () => {
    // Events can fire while joining, before the call screen listens.
    const room = await connect();
    await fire("user-published", remoteUser("them"), "audio");
    expect(room.participants.size).toBe(1);
    const [pub] = [...room.participants.get("them")!.tracks.values()];
    expect(pub.track.kind).toBe("audio");
  });

  it("camera off and on: same track, switched off then on (no new track)", async () => {
    const room = await connect();
    await fire("user-published", remoteUser("them"), "video");
    const p = room.participants.get("them")!;
    const subscribed = vi.fn();
    p.on("trackSubscribed", subscribed);
    const cam = p._track("video")!;
    const off = vi.fn();
    const on = vi.fn();
    cam.on("disabled", off);
    cam.on("enabled", on);
    await fire("user-unpublished", remoteUser("them"), "video");
    expect(cam.isEnabled).toBe(false);
    expect(off).toHaveBeenCalledTimes(1);
    await fire("user-published", remoteUser("them"), "video");
    expect(cam.isEnabled).toBe(true);
    expect(on).toHaveBeenCalledTimes(1);
    expect(subscribed).not.toHaveBeenCalled();
  });

  it("their audio plays through the call screen's own audio element", async () => {
    const room = await connect();
    await fire("user-published", remoteUser("them"), "audio");
    const mic = room.participants.get("them")!._track("audio")!;
    const el = document.createElement("audio");
    mic.attach(el);
    expect((el.srcObject as unknown as FakeMediaStream).tracks[0]).toBe(mic.mediaStreamTrack);
  });

  it("the other person leaving is reported (the call screen waits for them)", async () => {
    const room = await connect();
    await fire("user-joined", remoteUser("them"));
    const gone = vi.fn();
    room.on("participantDisconnected", gone);
    await fire("user-left", remoteUser("them"));
    expect(gone).toHaveBeenCalledTimes(1);
    expect(room.participants.size).toBe(0);
  });

  it("a weak connection reports reconnecting, then reconnected", async () => {
    const room = await connect();
    const r1 = vi.fn();
    const r2 = vi.fn();
    room.on("reconnecting", r1);
    room.on("reconnected", r2);
    await fire("connection-state-change", "RECONNECTING", "CONNECTED");
    await fire("connection-state-change", "CONNECTED", "RECONNECTING");
    expect(r1).toHaveBeenCalledTimes(1);
    expect(r2).toHaveBeenCalledTimes(1);
  });

  it("losing the connection reports disconnected so the call screen rejoins", async () => {
    const mic = appTrack("audio");
    const room = await connect([mic]);
    const lost = vi.fn();
    room.on("disconnected", lost);
    await fire("connection-state-change", "DISCONNECTED", "RECONNECTING", "NETWORK_ERROR");
    expect(lost).toHaveBeenCalledTimes(1);
    expect((lost.mock.calls[0][1] as { code: number }).code).toBe(0);
    // The microphone itself stays on for the rejoin; only Agora's copy closed.
    expect((mic.mediaStreamTrack as unknown as { stopped: boolean }).stopped).toBe(false);
    expect(sdk.state.published[0].closed).toBe(true);
  });

  it("joining from another phone is reported like Twilio's 53205", async () => {
    const room = await connect();
    const lost = vi.fn();
    room.on("disconnected", lost);
    await fire("connection-state-change", "DISCONNECTED", "CONNECTED", "UID_BANNED");
    expect((lost.mock.calls[0][1] as { code: number }).code).toBe(53205);
  });

  it("hanging up leaves the channel", async () => {
    const room = await connect();
    room.disconnect();
    expect(sdk.state.left).toBe(1);
  });

  it("switching camera: the old camera stops being sent, the new one is sent", async () => {
    const room = await connect([appTrack("audio")]);
    const cam1 = appTrack("video");
    await room.localParticipant.publishTrack(cam1 as never);
    const sent1 = sdk.state.published[1];
    room.localParticipant.unpublishTrack(cam1 as never);
    await new Promise((r) => setTimeout(r, 0));
    expect(sent1.closed).toBe(true);
    await room.localParticipant.publishTrack(appTrack("video") as never);
    expect(sdk.state.published).toHaveLength(3);
  });

  it("long calls get a fresh pass before the old one runs out", async () => {
    await connect();
    await fire("token-privilege-will-expire");
    expect(sdk.state.renewed).toEqual(["tok2"]);
  });

  it("a failed join leaves nothing behind", async () => {
    sdk.state.failJoin = true;
    await expect(connect()).rejects.toThrow();
    expect(sdk.state.left).toBe(1);
  });
});
