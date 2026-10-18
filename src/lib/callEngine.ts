import { connect, type LocalAudioTrack, type LocalVideoTrack, type Room } from "twilio-video";

// Which service carries the sound and picture of in-app calls.
//
// Agora is the default (cheaper for voice). Twilio stays available as a
// switch: set VITE_CALL_ENGINE=twilio in Vercel and redeploy, no Android
// rebuild. Dial pad calls to phone numbers always use Twilio.
//
// The person starting a call picks the service and it is written into the
// room name ("ag-…" for Agora, "chichat-…" for Twilio). The person answering
// follows the room name, so both phones always use the same service, even
// if the switch changes during a call.

export type CallEngine = "agora" | "twilio";

const AGORA_PREFIX = "ag-";

export function newCallEngine(): CallEngine {
  return import.meta.env.VITE_CALL_ENGINE === "twilio" ? "twilio" : "agora";
}

export function newRoomName(conversationId: string, now: number): string {
  const prefix = newCallEngine() === "agora" ? AGORA_PREFIX : "chichat-";
  return `${prefix}${conversationId}-${now}`;
}

export function engineForRoom(roomName: string): CallEngine {
  return roomName.startsWith(AGORA_PREFIX) ? "agora" : "twilio";
}

/** Twilio rooms are opened and closed on Twilio's side; Agora needs neither. */
export function roomNeedsTwilioSetup(roomName: string): boolean {
  return engineForRoom(roomName) === "twilio";
}

/** The pass to join a call, from twilio-token or agora-token. */
export type AgoraPass = { appId: string; token: string; uid: string };
export type CallPass = string | AgoraPass;

export function passFunctionFor(roomName: string): "twilio-token" | "agora-token" {
  return engineForRoom(roomName) === "agora" ? "agora-token" : "twilio-token";
}

/** Reads a pass out of the token function's reply, or null if it's not there. */
export function readPass(roomName: string, data: unknown): CallPass | null {
  const d = (data ?? {}) as Record<string, unknown>;
  if (engineForRoom(roomName) === "agora") {
    if (typeof d.appId === "string" && typeof d.token === "string" && typeof d.uid === "string") {
      return { appId: d.appId, token: d.token, uid: d.uid };
    }
    return null;
  }
  return typeof d.token === "string" && d.token ? d.token : null;
}

/**
 * Join the call room. Returns a Twilio Room, or for Agora an object that
 * behaves like the parts of a Twilio Room the call screen uses.
 */
export async function connectCall(
  roomName: string,
  pass: CallPass,
  tracks: (LocalAudioTrack | LocalVideoTrack)[],
  renewPass: () => Promise<CallPass>,
): Promise<Room> {
  if (engineForRoom(roomName) === "agora") {
    if (typeof pass === "string") throw new Error("Wrong call pass");
    // Loaded only when needed, so the app doesn't download it up front.
    const { connectAgoraRoom } = await import("./agoraRoom");
    return connectAgoraRoom(roomName, pass, tracks, renewPass) as unknown as Room;
  }
  if (typeof pass !== "string") throw new Error("Wrong call pass");
  return connect(pass, { name: roomName, tracks, dominantSpeaker: false });
}
