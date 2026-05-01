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
 * Renders the remote video container (when video) and an always-present
 * <audio> element that twilio audio tracks attach to. Using a real <audio>
 * element (not a div) is what actually makes remote sound play in browsers.
 *
 * Both the big stage and the small PiP tile are always mounted so Twilio's
 * attached <video> elements keep playing. We just flip which container is
 * full-size vs the floating thumbnail when the user taps to swap.
 */
const RemoteMedia = forwardRef<HTMLDivElement, Props>(
  ({ showVideo, localPreviewRef, remoteVideoRef, remoteAudioRef, swapped = false, onSwap }, _ref) => {
    return (
      <>
        {showVideo ? (
          <div className="mx-6 mt-2 flex-1 rounded-2xl bg-black/40 border border-border relative overflow-hidden">
            {/* Big stage — remote by default, local when swapped */}
            <div
              ref={swapped ? localPreviewRef : remoteVideoRef}
              className="absolute inset-0"
            />
            {/* Small PiP tile — tap to swap which feed is big */}
            <button
              type="button"
              onClick={onSwap}
              aria-label="Swap video"
              className="absolute bottom-2 right-2 w-20 h-28 rounded-lg bg-secondary border border-border overflow-hidden active:scale-95 transition-transform"
            >
              <div
                ref={swapped ? remoteVideoRef : localPreviewRef}
                className="absolute inset-0"
              />
            </button>
          </div>
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
