import { Mic, MicOff, Volume2, Video, VideoOff, PhoneOff, SwitchCamera } from "lucide-react";

type Props = {
  muted: boolean;
  videoEnabled: boolean;
  isVideo: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
};

export default function CallControls({
  muted,
  videoEnabled,
  isVideo,
  onToggleMute,
  onToggleVideo,
  onEndCall,
}: Props) {
  return (
    <div className="px-6 pb-6">
      <div className="flex items-center justify-around">
        <button
          onClick={onToggleMute}
          className={`w-11 h-11 rounded-full flex items-center justify-center ${
            muted
              ? "bg-destructive text-destructive-foreground"
              : "bg-secondary text-foreground hover:bg-secondary/80"
          }`}
          aria-label="Mute"
        >
          {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <button
          className="w-11 h-11 rounded-full flex items-center justify-center bg-primary text-primary-foreground"
          aria-label="Speaker"
          disabled
          title="Speaker (browser default)"
        >
          <Volume2 className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleVideo}
          disabled={!isVideo}
          className={`w-11 h-11 rounded-full flex items-center justify-center ${
            videoEnabled
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-foreground hover:bg-secondary/80"
          } ${!isVideo ? "opacity-40" : ""}`}
          aria-label="Toggle video"
        >
          {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </button>
        <button
          className="w-11 h-11 rounded-full flex items-center justify-center bg-secondary text-foreground hover:bg-secondary/80 opacity-40"
          aria-label="Switch camera"
          disabled
        >
          <SwitchCamera className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={onEndCall}
        className="mt-5 w-full h-12 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center justify-center gap-2 font-medium text-sm"
      >
        <PhoneOff className="w-4 h-4" />
        End call
      </button>
    </div>
  );
}
