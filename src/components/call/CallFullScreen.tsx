import type React from "react";
import type { NavigateFunction } from "react-router-dom";
import type { LocalVideoTrack, RemoteVideoTrack } from "twilio-video";
import { ChevronDown, Volume2 } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import CallHeader from "@/components/call/CallHeader";
import CallControls from "@/components/call/CallControls";
import RemoteMedia from "@/components/call/RemoteMedia";
import VideoUpgradePrompt from "@/components/call/VideoUpgradePrompt";
import HeldCallCard from "@/components/call/HeldCallCard";
import { tNow } from "@/lib/i18n/language";
import { isLockedCall } from "@/lib/lockedCall";
import {
  activeCallPath,
  requestEndCall,
  setCallHeld,
  swapToCall,
  type ActiveCallParams,
  type useCalls,
} from "@/lib/activeCall";

/**
 * The full-screen call view: video or caller details, held and waiting call
 * cards, minimise, tap for sound, the video request and the call controls.
 * Moved out of src/pages/CallScreen.tsx unchanged; all call logic (room,
 * tracks, status, hang up) stays in CallSession, which passes its state here.
 */
export interface CallFullScreenProps {
  videoFullscreen: boolean;
  localVideoTrack: LocalVideoTrack | null;
  remoteVideoTrack: RemoteVideoTrack | null;
  videoSwapped: boolean;
  setVideoSwapped: React.Dispatch<React.SetStateAction<boolean>>;
  isVideo: boolean;
  other: { id: string; display_name: string | null; avatar_url: string | null } | null;
  status: "connecting" | "ringing" | "connected" | "ended";
  /** Caller: the other phone has confirmed it is ringing. */
  remoteRinging?: boolean;
  /** How the call ended, for the status line. */
  endLabel?: { title: string; description?: string } | null;
  reconnecting: boolean;
  selfReconnecting: boolean;
  seconds: number;
  role: ActiveCallParams["role"];
  onHold: boolean;
  callsSnap: ReturnType<typeof useCalls>;
  otherCalls: ReturnType<typeof useCalls>["calls"];
  navigate: NavigateFunction;
  callId: string;
  minimize: () => void;
  needsTapForSound: boolean;
  tryPlayRemoteAudio: () => unknown;
  upgradeRequest: "incoming" | "outgoing" | null;
  acceptVideoUpgrade: () => unknown;
  declineVideoUpgrade: () => unknown;
  cancelVideoUpgrade: () => unknown;
  muted: boolean;
  videoEnabled: boolean;
  speakerOn: boolean;
  speakerAvailable: boolean;
  canSwitchCamera: boolean;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => unknown;
  switchCamera: () => unknown;
  upgradeToVideo: () => void;
  endCall: () => unknown;
  conversationId: string;
  held: boolean;
  showHold: boolean;
}

export default function CallFullScreen({
  videoFullscreen,
  localVideoTrack,
  remoteVideoTrack,
  videoSwapped,
  setVideoSwapped,
  isVideo,
  other,
  status,
  endLabel,
  remoteRinging,
  reconnecting,
  selfReconnecting,
  seconds,
  role,
  onHold,
  callsSnap,
  otherCalls,
  navigate,
  callId,
  minimize,
  needsTapForSound,
  tryPlayRemoteAudio,
  upgradeRequest,
  acceptVideoUpgrade,
  declineVideoUpgrade,
  cancelVideoUpgrade,
  muted,
  videoEnabled,
  speakerOn,
  speakerAvailable,
  canSwitchCamera,
  toggleMute,
  toggleVideo,
  toggleSpeaker,
  switchCamera,
  upgradeToVideo,
  endCall,
  conversationId,
  held,
  showHold,
}: CallFullScreenProps) {
  return (
    <MobileFrame>
      <div
        className={`h-full w-full flex flex-col ${
          videoFullscreen ? "bg-black" : "bg-gradient-to-b from-secondary to-background"
        }`}
      >
        <RemoteMedia
          showVideo={videoFullscreen}
          localVideoTrack={localVideoTrack}
          remoteVideoTrack={remoteVideoTrack}
          swapped={videoSwapped}
          onSwap={() => setVideoSwapped((s) => !s)}
        />

        <div
          className={
            videoFullscreen
              ? "fixed top-0 inset-x-0 z-20 bg-gradient-to-b from-black/70 via-black/40 to-transparent text-white pointer-events-none"
              : ""
          }
        >
          <CallHeader
            isVideo={isVideo}
            other={other}
            status={status}
            remoteRinging={remoteRinging}
            endLabel={endLabel}
            reconnecting={reconnecting && status === "connected"}
            poorNetwork={selfReconnecting}
            seconds={seconds}
            role={role}
            onHold={onHold}
            // A call-waiting or held-call card sits in the top part of the
            // screen: start this call's details just below it.
            belowCard={!videoFullscreen && (!!callsSnap.waiting || otherCalls.length > 0)}
            overlay={videoFullscreen}
          />
        </div>
        {/* Caller details stay in the upper part; the space goes here,
            above the controls (it used to sit above the details and push
            them down to the middle of the screen). */}
        {!videoFullscreen && <div className="flex-1 min-h-4" />}

        {videoFullscreen && onHold && (
          <div className="fixed inset-0 z-10 bg-black/60 flex items-center justify-center pointer-events-none">
            <span className="px-4 py-2 rounded-full bg-white/15 text-white text-sm font-semibold">{tNow("cs.onHold")}</span>
          </div>
        )}

        {otherCalls.map((c) => {
          const peer = callsSnap.info[c.callId];
          return (
            <HeldCallCard
              key={c.callId}
              name={peer?.name ?? tNow("chat.contact")}
              avatarUrl={peer?.avatarUrl ?? null}
              onSwap={() => {
                swapToCall(c.callId);
                navigate(activeCallPath(c), { replace: true });
              }}
              onEnd={() => requestEndCall(c.callId)}
            />
          );
        })}

        {status !== "ended" && !isLockedCall(callId) && (
          <button
            type="button"
            onClick={minimize}
            aria-label={tNow("cs.minimise")}
            title={tNow("cs.minimise")}
            className={`fixed z-30 left-3 top-[calc(env(safe-area-inset-top)+12px)] w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              videoFullscreen
                ? "bg-black/40 text-white hover:bg-black/60"
                : "bg-secondary/80 text-foreground hover:bg-secondary"
            }`}
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}

        {needsTapForSound && status === "connected" && (
          <button
            onClick={tryPlayRemoteAudio}
            className={`${
              videoFullscreen ? "fixed bottom-44 left-1/2 -translate-x-1/2 z-30" : "mx-6 mb-2"
            } px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-2 animate-pulse`}
          >
            <Volume2 className="w-4 h-4" />
            {tNow("cs.tapSound")}
          </button>
        )}

        <div
          className={
            videoFullscreen
              ? "fixed bottom-0 inset-x-0 z-20 pb-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
              : ""
          }
        >
        {upgradeRequest && status === "connected" && (
          <VideoUpgradePrompt
            mode={upgradeRequest}
            fromName={other?.display_name}
            onAccept={acceptVideoUpgrade}
            onDecline={declineVideoUpgrade}
            onCancel={cancelVideoUpgrade}
          />
        )}
        <CallControls
          muted={muted}
          videoEnabled={videoEnabled}
          isVideo={isVideo}
          speakerOn={speakerOn}
          speakerAvailable={speakerAvailable}
          canSwitchCamera={canSwitchCamera}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onToggleSpeaker={toggleSpeaker}
          onSwitchCamera={switchCamera}
          onUpgradeToVideo={upgradeToVideo}
          onEndCall={endCall}
          // Straight to the chat with this person; the call keeps going
          // (bubble and chat strip lead back). Not over the lock screen.
          onOpenChat={isLockedCall(callId) ? undefined : () => navigate(`/chat/${conversationId}`, { replace: true })}
          showHold={showHold && status !== "ended"}
          held={held}
          onToggleHold={() => setCallHeld(callId, !held)}
        />
        </div>
      </div>
    </MobileFrame>
  );
}
