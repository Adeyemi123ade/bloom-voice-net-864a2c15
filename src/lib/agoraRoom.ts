import AgoraRTC, {
  type ConnectionDisconnectedReason,
  type ConnectionState,
  type IAgoraRTCClient,
  type IAgoraRTCRemoteUser,
  type ILocalAudioTrack,
  type ILocalVideoTrack,
} from "agora-rtc-sdk-ng";
import type { LocalAudioTrack, LocalVideoTrack } from "twilio-video";
import type { AgoraPass, CallPass } from "./callEngine";

// Agora behind the same small set of Room / Participant / Track calls the
// call screen already uses with Twilio Video, so ringing, hold, call waiting,
// reconnecting and the floating window work unchanged:
//
//   room.participants, room.localParticipant.publishTrack / unpublishTrack,
//   room.on("participantConnected" | "participantDisconnected" |
//           "reconnecting" | "reconnected" | "disconnected"),
//   room.disconnect(),
//   participant.tracks, participant.on("trackSubscribed" | "trackUnsubscribed"),
//   track.kind, track.attach(), track.detach(), track.isEnabled,
//   track.on("enabled" | "disabled").
//
// The microphone and camera stay the Twilio track objects the app already
// makes (they're plain wrappers around the phone's microphone and camera).
// Agora gets its own copy of each, so leaving the room never switches off
// the microphone a reconnect is about to use again.

AgoraRTC.setLogLevel(3); // warnings and errors only
try { AgoraRTC.disableLogUpload(); } catch { /* ignore */ }

type Listener = (...args: unknown[]) => void;

class Emitter {
  private listeners = new Map<string, Set<Listener>>();
  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return this;
  }
  once(event: string, fn: Listener) {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped);
      fn(...args);
    };
    return this.on(event, wrapped);
  }
  off(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn);
    return this;
  }
  removeListener(event: string, fn: Listener) {
    return this.off(event, fn);
  }
  removeAllListeners(event?: string) {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
    return this;
  }
  protected emit(event: string, ...args: unknown[]) {
    [...(this.listeners.get(event) ?? [])].forEach((fn) => {
      try { fn(...args); } catch (e) { console.warn("[agora] listener failed", e); }
    });
  }
}

/** The other person's microphone or camera, attachable like a Twilio track. */
export class AgoraRemoteTrack extends Emitter {
  readonly kind: "audio" | "video";
  readonly sid: string;
  readonly name: string;
  isEnabled = true;
  mediaStreamTrack: MediaStreamTrack | null;
  private elements = new Set<HTMLMediaElement>();

  constructor(kind: "audio" | "video", sid: string, source: MediaStreamTrack) {
    super();
    this.kind = kind;
    this.sid = sid;
    this.name = sid;
    this.mediaStreamTrack = source;
  }

  attach(el?: HTMLMediaElement): HTMLMediaElement {
    const target = el ?? document.createElement(this.kind === "video" ? "video" : "audio");
    target.autoplay = true;
    target.setAttribute("playsinline", "true");
    if (this.kind === "video" && !el) target.muted = true; // sound comes from the audio track
    this.elements.add(target);
    this.feed(target);
    return target;
  }

  detach(el?: HTMLMediaElement): HTMLMediaElement[] {
    const list = el ? [el] : [...this.elements];
    list.forEach((e) => {
      this.elements.delete(e);
      if (e.srcObject && (e.srcObject as MediaStream).getTracks?.().includes(this.mediaStreamTrack!)) {
        e.srcObject = null;
      }
    });
    return list;
  }

  /** Back on (published again), possibly with a new source. */
  _enable(source: MediaStreamTrack) {
    const changed = source !== this.mediaStreamTrack;
    this.mediaStreamTrack = source;
    if (changed) this.elements.forEach((e) => this.feed(e));
    if (!this.isEnabled) {
      this.isEnabled = true;
      this.emit("enabled", this);
    }
  }

  _disable() {
    if (!this.isEnabled) return;
    this.isEnabled = false;
    this.emit("disabled", this);
  }

  private feed(el: HTMLMediaElement) {
    if (!this.mediaStreamTrack) return;
    el.srcObject = new MediaStream([this.mediaStreamTrack]);
    // A blocked play() for audio is handled by the call screen (tap for sound).
    void el.play?.()?.catch(() => {});
  }
}

type Publication = { trackSid: string; trackName: string; kind: "audio" | "video"; track: AgoraRemoteTrack };

/** The other person on the call. */
export class AgoraParticipant extends Emitter {
  readonly identity: string;
  readonly sid: string;
  readonly tracks = new Map<string, Publication>();
  readonly audioTracks = new Map<string, Publication>();
  readonly videoTracks = new Map<string, Publication>();

  constructor(identity: string) {
    super();
    this.identity = identity;
    this.sid = identity;
  }

  _track(kind: "audio" | "video") {
    return this.tracks.get(`${this.sid}-${kind}`)?.track ?? null;
  }

  _add(track: AgoraRemoteTrack) {
    const pub: Publication = { trackSid: track.sid, trackName: track.name, kind: track.kind, track };
    this.tracks.set(track.sid, pub);
    (track.kind === "audio" ? this.audioTracks : this.videoTracks).set(track.sid, pub);
    this.emit("trackSubscribed", track, pub, this);
  }

  _removeAll() {
    [...this.tracks.values()].forEach((pub) => {
      this.tracks.delete(pub.trackSid);
      this.audioTracks.delete(pub.trackSid);
      this.videoTracks.delete(pub.trackSid);
      this.emit("trackUnsubscribed", pub.track, pub, this);
    });
  }
}

type AppTrack = LocalAudioTrack | LocalVideoTrack;
type Published = {
  agora: ILocalAudioTrack | ILocalVideoTrack;
  copy: MediaStreamTrack;
  onDisabled: () => void;
  onEnabled: () => void;
  onStopped: () => void;
};

/** A call room on Agora, used the same way as a Twilio Video room. */
export class AgoraRoom extends Emitter {
  readonly name: string;
  state: "connected" | "reconnecting" | "disconnected" = "connected";
  readonly participants = new Map<string, AgoraParticipant>();
  readonly localParticipant: {
    identity: string;
    publishTrack: (t: AppTrack) => Promise<void>;
    unpublishTrack: (t: AppTrack) => void;
  };

  private client: IAgoraRTCClient;
  private published = new Map<AppTrack, Published>();
  private leftOnPurpose = false;

  constructor(name: string, client: IAgoraRTCClient, uid: string) {
    super();
    this.name = name;
    this.client = client;
    this.localParticipant = {
      identity: uid,
      publishTrack: (t) => this.publish(t),
      unpublishTrack: (t) => { void this.unpublish(t); },
    };
  }

  // ── The other person ─────────────────────────────────────────────────

  _participant(user: IAgoraRTCRemoteUser): { p: AgoraParticipant; isNew: boolean } {
    const id = String(user.uid);
    const existing = this.participants.get(id);
    if (existing) return { p: existing, isNew: false };
    const p = new AgoraParticipant(id);
    this.participants.set(id, p);
    return { p, isNew: true };
  }

  _joined(user: IAgoraRTCRemoteUser) {
    const { p, isNew } = this._participant(user);
    if (isNew) this.emit("participantConnected", p);
  }

  _left(user: IAgoraRTCRemoteUser) {
    const id = String(user.uid);
    const p = this.participants.get(id);
    if (!p) return;
    this.participants.delete(id);
    p._removeAll();
    this.emit("participantDisconnected", p);
  }

  async _published(user: IAgoraRTCRemoteUser, kind: "audio" | "video") {
    this._joined(user);
    try {
      await this.client.subscribe(user, kind);
    } catch (e) {
      console.warn("[agora] subscribe failed", e);
      return;
    }
    const remote = kind === "audio" ? user.audioTrack : user.videoTrack;
    const source = remote?.getMediaStreamTrack();
    const p = this.participants.get(String(user.uid));
    if (!source || !p) return;
    const existing = p._track(kind);
    if (existing) existing._enable(source);
    else p._add(new AgoraRemoteTrack(kind, `${p.sid}-${kind}`, source));
  }

  _unpublished(user: IAgoraRTCRemoteUser, kind: "audio" | "video") {
    // Muted or camera switched off: the track stays, switched off.
    this.participants.get(String(user.uid))?._track(kind)?._disable();
  }

  _stateChange(cur: ConnectionState, prev: ConnectionState, reason?: ConnectionDisconnectedReason) {
    if (cur === "RECONNECTING") {
      this.state = "reconnecting";
      this.emit("reconnecting");
    } else if (cur === "CONNECTED" && prev === "RECONNECTING") {
      this.state = "connected";
      this.emit("reconnected");
    } else if (cur === "DISCONNECTED" && !this.leftOnPurpose) {
      this.state = "disconnected";
      // Same account joined from another phone: like Twilio's 53205.
      const error = reason === "UID_BANNED" ? { code: 53205 } : { code: 0, message: reason };
      this.teardown();
      this.emit("disconnected", this, error);
    }
  }

  // ── This phone's microphone and camera ───────────────────────────────

  private async publish(t: AppTrack) {
    if (this.published.has(t)) return;
    const copy = t.mediaStreamTrack.clone();
    const agora = t.kind === "audio"
      ? AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: copy })
      : AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: copy });
    const entry: Published = {
      agora,
      copy,
      onDisabled: () => { void agora.setMuted(true).catch(() => {}); },
      onEnabled: () => { void agora.setMuted(false).catch(() => {}); },
      onStopped: () => { void this.unpublish(t); },
    };
    this.published.set(t, entry);
    t.on("disabled", entry.onDisabled);
    t.on("enabled", entry.onEnabled);
    t.on("stopped", entry.onStopped);
    try {
      await this.client.publish(agora);
      // Muted or on hold before it was sent.
      if (!t.isEnabled) await agora.setMuted(true);
    } catch (e) {
      this.release(t);
      throw e;
    }
  }

  private async unpublish(t: AppTrack) {
    const entry = this.published.get(t);
    if (!entry) return;
    try { await this.client.unpublish(entry.agora); } catch { /* ignore */ }
    this.release(t);
  }

  private release(t: AppTrack) {
    const entry = this.published.get(t);
    if (!entry) return;
    this.published.delete(t);
    t.off("disabled", entry.onDisabled);
    t.off("enabled", entry.onEnabled);
    t.off("stopped", entry.onStopped);
    try { entry.agora.close(); } catch { /* ignore */ }
    try { entry.copy.stop(); } catch { /* ignore */ }
  }

  private teardown() {
    [...this.published.keys()].forEach((t) => this.release(t));
    [...this.participants.values()].forEach((p) => p._removeAll());
    this.participants.clear();
  }

  disconnect() {
    if (this.leftOnPurpose) return this;
    this.leftOnPurpose = true;
    this.state = "disconnected";
    this.teardown();
    void this.client.leave().catch(() => {});
    this.client.removeAllListeners();
    this.emit("disconnected", this);
    return this;
  }
}

export async function connectAgoraRoom(
  roomName: string,
  pass: AgoraPass,
  tracks: AppTrack[],
  renewPass: () => Promise<CallPass>,
): Promise<AgoraRoom> {
  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  const room = new AgoraRoom(roomName, client, pass.uid);

  // Listen before joining so nobody already in the call is missed.
  client.on("user-joined", (u) => room._joined(u));
  client.on("user-left", (u) => room._left(u));
  client.on("user-published", (u, kind) => {
    if (kind === "audio" || kind === "video") void room._published(u, kind);
  });
  client.on("user-unpublished", (u, kind) => {
    if (kind === "audio" || kind === "video") room._unpublished(u, kind);
  });
  client.on("connection-state-change", (cur, prev, reason) => room._stateChange(cur, prev, reason));
  // Long calls: get a fresh pass before this one runs out.
  client.on("token-privilege-will-expire", async () => {
    try {
      const next = await renewPass();
      if (typeof next !== "string") await client.renewToken(next.token);
    } catch (e) {
      console.warn("[agora] pass renewal failed", e);
    }
  });

  try {
    await client.join(pass.appId, roomName, pass.token, pass.uid);
    for (const t of tracks) await room.localParticipant.publishTrack(t);
  } catch (e) {
    room.disconnect();
    throw e;
  }
  return room;
}
