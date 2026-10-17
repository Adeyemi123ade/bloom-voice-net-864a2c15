import { Mic, MicOff, Volume2, VolumeX, Video, VideoOff, PhoneOff, SwitchCamera, VideoIcon, Pause, Play, MessageCircle } from "lucide-react";

type Props = {
  muted: boolean;
  videoEnabled: boolean;
  isVideo: boolean;
  speakerOn: boolean;
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
        <button
          onClick={onToggleSpeaker}
          className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform ${
            speakerOn
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-foreground hover:bg-secondary/80"
          }`}
          aria-label={speakerOn ? "Speaker on" : "Speaker off"}
          title={speakerOn ? "Loudspeaker" : "Earpiece"}
        >
          {speakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        {isVideo ? (
          <button
            onClick={onToggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform ${
              videoEnabled
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-foreground hover:bg-secondary/80"
            }`}
            aria-label="Toggle video"
          >
            {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
        ) : (
          <button
            onClick={onUpgradeToVideo}
            className="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform bg-secondary text-foreground hover:bg-secondary/80"
            aria-label="Switch to video call"
            title="Switch to video"
          >
            <VideoIcon className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={onToggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform ${
            muted
              ? "bg-destructive text-destructive-foreground"
              : "bg-secondary text-foreground hover:bg-secondary/80"
          }`}
          aria-label="Mute"
        >
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          onClick={onSwitchCamera}
          disabled={!isVideo || !videoEnabled || !canSwitchCamera}
          className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform bg-secondary text-foreground hover:bg-secondary/80 ${
            !isVideo || !videoEnabled || !canSwitchCamera ? "opacity-40" : ""
          }`}
          aria-label="Switch camera"
          title="Switch camera"
        >
          <SwitchCamera className="w-5 h-5" />
        </button>

        {onOpenChat && (
          <button
            onClick={onOpenChat}
            className="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform bg-secondary text-foreground hover:bg-secondary/80"
            aria-label="Open chat"
            title="Chat"
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
            onClick={onToggleHold}
            aria-label={held ? "Resume call" : "Hold call"}
            className={`flex-1 h-12 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform font-medium text-base ${
              held
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-secondary text-foreground hover:bg-secondary/80"
            }`}
          >
            {held ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            {held ? "Resume" : "Hold"}
          </button>
        )}
        <button
          onClick={onEndCall}
          className="flex-1 h-12 rounded-full active:scale-95 transition-transform bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center justify-center gap-2 font-medium text-base"
        >
          <PhoneOff className="w-5 h-5" />
          End call
        </button>
      </div>
    </div>
  );
}
