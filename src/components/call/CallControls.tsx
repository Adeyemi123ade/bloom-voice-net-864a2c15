import { Mic, MicOff, Volume2, VolumeX, Video, VideoOff, PhoneOff, SwitchCamera, VideoIcon } from "lucide-react";

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
}: Props) {
  return (
    <div className="px-6 pb-6">
      <div className="flex items-center justify-around">
        <button
          onClick={onToggleSpeaker}
          className={`w-12 h-12 rounded-full flex items-center justify-center ${
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
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
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
            className="w-12 h-12 rounded-full flex items-center justify-center bg-secondary text-foreground hover:bg-secondary/80"
            aria-label="Switch to video call"
            title="Switch to video"
          >
            <VideoIcon className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={onToggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center ${
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
          className={`w-12 h-12 rounded-full flex items-center justify-center bg-secondary text-foreground hover:bg-secondary/80 ${
            !isVideo || !videoEnabled || !canSwitchCamera ? "opacity-40" : ""
          }`}
          aria-label="Switch camera"
          title="Switch camera"
        >
          <SwitchCamera className="w-5 h-5" />
        </button>
      </div>

      <button
        onClick={onEndCall}
        className="mt-5 w-full h-12 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center justify-center gap-2 font-medium text-base"
      >
        <PhoneOff className="w-5 h-5" />
        End call
      </button>
    </div>
  );
}
