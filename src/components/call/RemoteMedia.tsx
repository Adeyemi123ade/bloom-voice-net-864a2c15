import { forwardRef } from "react";

type Props = {
  showVideo: boolean;
  localPreviewRef: React.RefObject<HTMLDivElement>;
  remoteVideoRef: React.RefObject<HTMLDivElement>;
  remoteAudioRef: React.RefObject<HTMLAudioElement>;
  /** When true, swap which video is shown big vs in the small PiP tile. */
  swapped?: boolean;
  onSwap?: () => void;
};

/**
 * When showVideo is true, the big stage fills the ENTIRE screen edge-to-edge
 * (full-bleed) so the call header and controls overlay on top of the video.
 * The small PiP tile floats above the controls.
 *
 * Both video containers are always mounted so Twilio's attached <video>
 * elements keep playing through swaps.
 */
const RemoteMedia = forwardRef<HTMLDivElement, Props>(
  ({ showVideo, localPreviewRef, remoteVideoRef, remoteAudioRef, swapped = false, onSwap }, _ref) => {
    return (
      <>
        {showVideo ? (
          <>
            {/* Full-bleed big stage — sits behind header & controls */}
            <div className="fixed inset-0 z-0 bg-black">
              <div
                ref={swapped ? localPreviewRef : remoteVideoRef}
                className="absolute inset-0"
              />
            </div>
            {/* Floating PiP tile — above controls, tap to swap */}
            <button
              type="button"
              onClick={onSwap}
              aria-label="Swap video"
              className="fixed bottom-36 right-4 z-30 w-24 h-32 rounded-xl bg-secondary border border-border overflow-hidden shadow-lg active:scale-95 transition-transform"
            >
              <div
                ref={swapped ? remoteVideoRef : localPreviewRef}
                className="absolute inset-0"
              />
            </button>
          </>
        ) : (
          <div className="flex-1" />
        )}
        {/* Real audio element — Twilio attaches remote audio tracks here. */}
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          {...({ "webkit-playsinline": "true" } as Record<string, string>)}
          className="hidden"
        />
      </>
    );
  },
);

RemoteMedia.displayName = "RemoteMedia";
export default RemoteMedia;
