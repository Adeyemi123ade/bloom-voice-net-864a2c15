import { forwardRef } from "react";

type Props = {
  showVideo: boolean;
  localPreviewRef: React.RefObject<HTMLDivElement>;
  remoteVideoRef: React.RefObject<HTMLDivElement>;
  remoteAudioRef: React.RefObject<HTMLAudioElement>;
};

/**
 * Renders the remote video container (when video) and an always-present
 * <audio> element that twilio audio tracks attach to. Using a real <audio>
 * element (not a div) is what actually makes remote sound play in browsers.
 */
const RemoteMedia = forwardRef<HTMLDivElement, Props>(
  ({ showVideo, localPreviewRef, remoteVideoRef, remoteAudioRef }, _ref) => {
    return (
      <>
        {showVideo ? (
          <div className="mx-6 mt-2 flex-1 rounded-2xl bg-black/40 border border-border relative overflow-hidden">
            <div ref={remoteVideoRef} className="absolute inset-0" />
            <div
              ref={localPreviewRef}
              className="absolute bottom-2 right-2 w-20 h-28 rounded-lg bg-secondary border border-border overflow-hidden"
            />
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
