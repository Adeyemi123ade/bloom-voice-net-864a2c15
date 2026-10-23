// Loudspeaker / earpiece during calls.
//
// Android app: the ChiChatCalls plugin switches the real audio route
// (CallAudioRoute.java) and reports what is actually in use, including when a
// headset or Bluetooth device comes or goes. Apps built before this existed
// don't have the method: the button then says to update the app.
//
// Website: browsers don't let a page choose between loudspeaker and earpiece
// (the phone or computer decides), so the button isn't offered there.
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isAndroidNative } from "@/lib/nativeCalls";

export type AudioRoute = { speaker: boolean; headset: boolean; bluetooth: boolean; inCall?: boolean };

interface AudioRoutePlugin {
  setSpeakerphone(options: { on: boolean }): Promise<AudioRoute>;
  getAudioRoute(): Promise<AudioRoute>;
  addListener(event: "audioRouteChanged", fn: (route: AudioRoute) => void): Promise<PluginListenerHandle>;
}

const ChiChatCalls = registerPlugin<AudioRoutePlugin>("ChiChatCalls");

/** "native": real switching. "update": the installed app is too old. "none": not offered (website). */
export type SpeakerSupport = "native" | "update" | "none";

export function initialSpeakerSupport(): SpeakerSupport {
  return isAndroidNative() ? "native" : "none";
}

const isMissingMethod = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
  return code === "UNIMPLEMENTED" || msg.includes("not implemented") || msg.includes("is not implemented");
};

export class SpeakerUnsupportedError extends Error {}

/** Where call audio plays now. */
export async function getAudioRoute(): Promise<AudioRoute> {
  try {
    return await ChiChatCalls.getAudioRoute();
  } catch (e) {
    if (isMissingMethod(e)) throw new SpeakerUnsupportedError("update");
    throw e;
  }
}

/** Loudspeaker on or off; answers with the route actually in use afterwards. */
export async function setLoudspeaker(on: boolean): Promise<AudioRoute> {
  try {
    return await ChiChatCalls.setSpeakerphone({ on });
  } catch (e) {
    if (isMissingMethod(e)) throw new SpeakerUnsupportedError("update");
    throw e;
  }
}

/** Calls `fn` whenever the route changes (headset plugged in, Bluetooth, other app). */
export function onAudioRouteChange(fn: (route: AudioRoute) => void): () => void {
  let handle: PluginListenerHandle | null = null;
  let removed = false;
  ChiChatCalls.addListener("audioRouteChanged", fn)
    .then((h) => {
      if (removed) void h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    removed = true;
    void handle?.remove();
  };
}
