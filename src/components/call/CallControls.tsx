import { tNow } from "@/lib/i18n/language";
import { Mic, MicOff, Volume2, VolumeX, Video, VideoOff, PhoneOff, SwitchCamera, VideoIcon, Pause, Play, MessageCircle } from "lucide-react";
import { tapFeedback } from "@/lib/haptics";

/** A short buzz on every call button, so a press is felt before anything changes. */
const withTap = (f?: () => void) => () => {
  tapFeedback();
  f?.();
};

type Props = {
  muted: boolean;
  videoEnabled: boolean;
  isVideo: boolean;
  speakerOn: boolean;
  /** False where the loudspeaker can't be chosen (website): no button. */
  speakerAvailable?: boolean;
  canSwitchCamera: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
  onSwitchCamera: () => void;
  onUpgradeToVideo: () => void;
  onEndCall: () => void;
  /** Opens the chat with this person; the call carries on. Hidden when not given. */
  onOpenChat?: () => void;
  /** Shown when another call is waiting or on hold, or this call is on hold. */
  showHold?: boolean;
  held?: boolean;
  onToggleHold?: () => void;
};

export default function CallControls({
  muted,
  videoEnabled,
  isVideo,
  speakerOn,
  speakerAvailable = true,
  canSwitchCamera,
  onToggleMute,
  onToggleVideo,
  onToggleSpeaker,
  onSwitchCamera,
  onUpgradeToVideo,
  onEndCall,
  onOpenChat,
  showHold = false,
  held = false,
  onToggleHold,
}: Props) {
  return (
    <div className="px-6 pb-6">
      <div className="flex items-center justify-around">
        {speakerAvailable && (
        <button
          onClick={withTap(onToggleSpeaker)}
          className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform ${
            speakerOn
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-foreground hover:bg-secondary/80"
          }`}
          aria-label={speakerOn ? tNow("cc.speakerOn") : tNow("cc.speakerOff")}
          title={speakerOn ? tNow("cc.loudspeaker") : tNow("cc.earpiece")}
        >
          {speakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
        )}

        {isVideo ? (
          <button
            onClick={withTap(onToggleVideo)}
            className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform ${
              videoEnabled
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-foreground hover:bg-secondary/80"
            }`}
            aria-label={tNow("cc.toggleVideo")}
          >
            {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
        ) : (
          <button
            onClick={withTap(onUpgradeToVideo)}
            className="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform bg-secondary text-foreground hover:bg-secondary/80"
            aria-label={tNow("cc.switchToVideoCall")}
            title={tNow("cc.switchToVideo")}
          >
            <VideoIcon className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={withTap(onToggleMute)}
          className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform ${
            muted
              ? "bg-destructive text-destructive-foreground"
              : "bg-secondary text-foreground hover:bg-secondary/80"
          }`}
          aria-label={muted ? tNow("cc.unmute") : tNow("cc.mute")}
          aria-pressed={muted}
        >
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          onClick={withTap(onSwitchCamera)}
          disabled={!isVideo || !videoEnabled || !canSwitchCamera}
          className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform bg-secondary text-foreground hover:bg-secondary/80 ${
            !isVideo || !videoEnabled || !canSwitchCamera ? "opacity-40" : ""
          }`}
          aria-label={tNow("cc.switchCamera")}
          title={tNow("cc.switchCamera")}
        >
          <SwitchCamera className="w-5 h-5" />
        </button>

        {onOpenChat && (
          <button
            onClick={withTap(onOpenChat)}
            className="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform bg-secondary text-foreground hover:bg-secondary/80"
            aria-label={tNow("cc.openChat")}
            title={tNow("cc.chat")}
          >
            <MessageCircle className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* End call is half the width (same shape); next to Hold, the two
          share the row. */}
      <div className={`mt-5 flex gap-3 ${showHold ? "" : "w-1/2 mx-auto"}`}>
        {showHold && (
          <button
            onClick={withTap(onToggleHold)}
            aria-label={held ? tNow("cc.resumeCall") : tNow("cc.holdCall")}
            className={`flex-1 h-12 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform font-medium text-base ${
              held
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-secondary text-foreground hover:bg-secondary/80"
            }`}
          >
            {held ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            {held ? tNow("cc.resume") : tNow("cc.hold")}
          </button>
        )}
        <button
          onClick={withTap(onEndCall)}
          className="flex-1 h-12 rounded-full active:scale-95 transition-transform bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center justify-center gap-2 font-medium text-base"
        >
          <PhoneOff className="w-5 h-5" />
          {tNow("cc.endCall")}
        </button>
      </div>
    </div>
  );
}
