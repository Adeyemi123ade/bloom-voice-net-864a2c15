import { supabase } from "@/integrations/supabase/client";

// The permission to join a call (a Twilio access token), fetched as early as
// possible (while it's still ringing) so answering doesn't wait for it.
// Tokens are valid for an hour; one fetch per call room.

const cache = new Map<string, Promise<string>>();

function fetchToken(roomName: string): Promise<string> {
  return supabase.functions.invoke("twilio-token", { body: { roomName } }).then(({ data, error }) => {
    if (error) throw error;
    const token = (data as { token?: string } | null)?.token;
    if (!token) throw new Error("No token returned");
    return token;
  });
}

/** Start fetching now; failures are forgotten so getCallToken can retry. */
export function prefetchCallToken(roomName: string): void {
  if (!roomName || cache.has(roomName)) return;
  const p = fetchToken(roomName);
  cache.set(roomName, p);
  p.catch(() => {
    if (cache.get(roomName) === p) cache.delete(roomName);
  });
}

export async function getCallToken(roomName: string): Promise<string> {
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
