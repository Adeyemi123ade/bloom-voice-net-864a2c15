// Picks a MIME type MediaRecorder can actually record in on this device,
// instead of assuming audio/webm everywhere. Safari (iOS/macOS) doesn't
// support webm at all and records mp4/aac instead; Android/Chrome browsers
// vary too. Recording with the wrong assumption doesn't fail loudly — it
// silently produces a file whose declared type doesn't match its real bytes,
// which then fails to decode wherever it's played back.
const CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/ogg;codecs=opus",
];

export function pickRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return "audio/webm";
  }
  for (const candidate of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return "";
}

export function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
