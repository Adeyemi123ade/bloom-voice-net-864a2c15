// Per-device preference for showing a "Transcribe" option on voice notes
// (sent or received) in chat, separate from the always-on dictate-to-text
// composer feature. Defaults to enabled so people discover it; anyone who
// doesn't want the extra button can turn it off in Phone settings.
const STORAGE_KEY = "chichat:voice-transcribe-enabled";

export function isVoiceTranscribeEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setVoiceTranscribeEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
