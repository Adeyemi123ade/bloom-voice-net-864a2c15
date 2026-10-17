import { registerPlugin } from "@capacitor/core";
import { isAndroidNative } from "@/lib/nativeCalls";
import { selectedRingtoneFile } from "@/lib/ringtones";

/**
 * Gives the Android app a copy of the ringtone chosen in ChiChat, so calls
 * ring with it while ChiChat is closed or the phone is locked (the phone app
 * can't read the app's own storage). Sent in pieces: files can be 50 MB.
 */
interface RingtonePlugin {
  ringtoneBegin(o: { ext: string }): Promise<void>;
  ringtoneAppend(o: { data: string }): Promise<void>;
  ringtoneCommit(): Promise<void>;
}
const ChiChatCalls = registerPlugin<RingtonePlugin>("ChiChatCalls");

const SYNCED_KEY = "chichat.native_ringtone";
const CHUNK = 512 * 1024;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** The file as base64 pieces, in order. */
export async function* ringtoneChunks(blob: Blob): AsyncGenerator<string> {
  for (let at = 0; at < blob.size; at += CHUNK) {
    yield toBase64(new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer()));
  }
}

let running: Promise<void> | null = null;

/** Sends the chosen ringtone to the phone app if it doesn't have it yet. */
export function syncNativeRingtone(): Promise<void> {
  if (!isAndroidNative()) return Promise.resolve();
  const run = async () => {
    const file = await selectedRingtoneFile().catch(() => null);
    if (!file) return;
    try {
      if (localStorage.getItem(SYNCED_KEY) === file.key) return;
    } catch {
      /* ignore */
    }
    try {
      await ChiChatCalls.ringtoneBegin({ ext: file.ext });
      for await (const data of ringtoneChunks(file.blob)) {
        await ChiChatCalls.ringtoneAppend({ data });
      }
      await ChiChatCalls.ringtoneCommit();
      localStorage.setItem(SYNCED_KEY, file.key);
    } catch (e) {
      // An app build without this yet, or no space: the phone app keeps
      // ringing with ChiChat's own default tone. Tried again next time.
      console.warn("[ringtone] sync to the phone app failed", e);
    }
  };
  running = (running ?? Promise.resolve()).then(run, run);
  return running;
}
