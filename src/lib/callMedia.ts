import { LocalAudioTrack, LocalVideoTrack } from "twilio-video";
import { isLikelyInAppBrowser } from "@/lib/micPermission";

type PreparedCallMedia = {
  stream: MediaStream;
  audioTrack: LocalAudioTrack;
  videoTrack: LocalVideoTrack | null;
};

let preparedCallMedia: PreparedCallMedia | null = null;
// The microphone/camera request in progress, so the call screen can open
// straight away and pick the result up when it's ready.
let pendingPrepare: Promise<PreparedCallMedia> | null = null;

/** Start getting the microphone (and camera) without waiting for it. */
export function startPreparingCallMedia(isVideo: boolean): Promise<PreparedCallMedia> {
  const p = prepareCallMedia(isVideo);
  pendingPrepare = p;
  p.catch(() => {}).finally(() => {
    if (pendingPrepare === p) pendingPrepare = null;
  });
  return p;
}

/**
 * The prepared microphone/camera, waiting for a request still in progress.
 * Null if none was prepared (the caller then creates its own tracks).
 * Throws if the request in progress failed (e.g. permission refused).
 */
export async function takePreparedCallMedia(): Promise<PreparedCallMedia | null> {
  if (pendingPrepare) await pendingPrepare;
  return consumePreparedCallMedia();
}

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

export function clearPreparedCallMedia() {
  if (!preparedCallMedia) return;
  stopStream(preparedCallMedia.stream);
  preparedCallMedia = null;
}

export function consumePreparedCallMedia() {
  const media = preparedCallMedia;
  preparedCallMedia = null;
  return media;
}

export async function prepareCallMedia(isVideo: boolean) {
  clearPreparedCallMedia();

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Media devices are not supported in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia(
    isVideo
      ? { audio: true, video: { facingMode: "user", width: { ideal: 640 } } }
      : { audio: true, video: false },
  );

  try {
    const rawAudioTrack = stream.getAudioTracks()[0];
    if (!rawAudioTrack) throw new Error("No microphone found.");

    const rawVideoTrack = isVideo ? stream.getVideoTracks()[0] : undefined;
    if (isVideo && !rawVideoTrack) throw new Error("No camera found.");

    preparedCallMedia = {
      stream,
      audioTrack: new LocalAudioTrack(rawAudioTrack),
      videoTrack: rawVideoTrack ? new LocalVideoTrack(rawVideoTrack) : null,
    };

    return preparedCallMedia;
  } catch (error) {
    stopStream(stream);
    throw error;
  }
}

export function formatCallMediaError(error: unknown, isVideo: boolean) {
  const name = typeof error === "object" && error && "name" in error
    ? String((error as { name?: string }).name)
    : "";

  if (name === "NotAllowedError") {
    if (isLikelyInAppBrowser()) {
      return "This link is open inside an app's built-in browser, which blocks microphone/camera access. Tap the menu (••• or ⋮) and choose \"Open in Chrome\" or \"Open in Safari\", then try again.";
    }
    return isVideo
      ? "Microphone or camera access was blocked. Allow it and try again."
      : "Microphone access was blocked. Allow it and try again.";
  }
  if (name === "NotFoundError") {
    return isVideo ? "Microphone or camera was not found on this device." : "No microphone was found on this device.";
  }
  if (name === "NotReadableError") {
    return isVideo
      ? "Microphone or camera is busy in another app. Close it and try again."
      : "Microphone is busy in another app. Close it and try again.";
  }

  return error instanceof Error
    ? error.message
    : `Could not access the ${isVideo ? "microphone and camera" : "microphone"}.`;
}