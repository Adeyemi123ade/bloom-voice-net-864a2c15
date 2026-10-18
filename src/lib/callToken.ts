import { supabase } from "@/integrations/supabase/client";
import { engineForRoom, passFunctionFor, readPass, type CallPass } from "@/lib/callEngine";

// The permission to join a call (a Twilio or Agora pass, depending on the
// room), fetched as early as possible (while it's still ringing) so answering
// doesn't wait for it. One fetch per call room.

const cache = new Map<string, Promise<CallPass>>();

function fetchToken(roomName: string): Promise<CallPass> {
  return supabase.functions
    .invoke(passFunctionFor(roomName), { body: { roomName } })
    .then(({ data, error }) => {
      if (error) throw error;
      const pass = readPass(roomName, data);
      if (!pass) throw new Error("No token returned");
      return pass;
    });
}

/** Start fetching now; failures are forgotten so getCallToken can retry. */
export function prefetchCallToken(roomName: string): void {
  if (!roomName || cache.has(roomName)) return;
  // Download the Agora call code while it rings, so answering doesn't wait.
  if (engineForRoom(roomName) === "agora") void import("@/lib/agoraRoom").catch(() => {});
  const p = fetchToken(roomName);
  cache.set(roomName, p);
  p.catch(() => {
    if (cache.get(roomName) === p) cache.delete(roomName);
  });
}

export async function getCallToken(roomName: string): Promise<CallPass> {
  const pending = cache.get(roomName);
  if (pending) {
    try {
      return await pending;
    } catch {
      /* fetched too early (e.g. before the call was saved): fetch again */
    }
  }
  const p = fetchToken(roomName);
  cache.set(roomName, p);
  try {
    return await p;
  } catch (e) {
    cache.delete(roomName);
    throw e;
  }
}

/** A fresh pass for a long call (the cached one is about to run out). */
export function renewCallToken(roomName: string): Promise<CallPass> {
  cache.delete(roomName);
  return getCallToken(roomName);
}
