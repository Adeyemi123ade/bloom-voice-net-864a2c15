import { tNow } from "@/lib/i18n/language";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import type { LocalVideoTrack, RemoteVideoTrack } from "twilio-video";
import { useIsOnline } from "@/lib/network";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Profile = { id: string; display_name: string | null; avatar_url: string | null };
type AnyVideoTrack = LocalVideoTrack | RemoteVideoTrack;

type Props = {
  isVideo: boolean;
  other: Profile | null;
  status: "connecting" | "ringing" | "connected" | "ended";
  /** How the call ended, shown in place of "Ended". */
  endLabel?: string;
  /** The connection dropped and is coming back; the call is still on. */
  reconnecting?: boolean;
  poorNetwork?: boolean;
  seconds: number;
  remoteVideoTrack: RemoteVideoTrack | null;
  localVideoTrack: LocalVideoTrack | null;
  /** Whether the user's own camera is switched on. */
  localVideoEnabled: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onEndCall: () => void;
  onOpen: () => void;
};

const MARGIN = 10;
const STRIP_H = 40; // control strip under the video, so buttons never cover a face

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

/** Video window size: about 40% of the screen width, portrait 3:4. */
function videoSize() {
  const w = Math.round(Math.min(Math.max(window.innerWidth * 0.42, 140), 220));
  return { w, h: Math.round((w * 4) / 3) };
}

/**
 * Attaches a Twilio video track to a container while `show` is true.
 * Twilio tracks can be attached to several elements at once, so this does not
 * disturb the call itself. The window is portrait 3:4 like a phone camera, and
 * the crop is biased upward (object-position 30%) so faces stay in frame.
 */
function useAttachedVideo(
  ref: React.RefObject<HTMLDivElement>,
  track: AnyVideoTrack | null,
  show: boolean,
  mirror = false,
) {
  useEffect(() => {
    const box = ref.current;
    if (!show || !box || !track) return;
    const el = track.attach();
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.objectFit = "cover";
    el.style.objectPosition = "center 30%";
    if (mirror) el.style.transform = "scaleX(-1)";
    el.setAttribute("playsinline", "true");
    el.muted = true;
    box.appendChild(el);
    return () => {
      try { track.detach(el); } catch { /* ignore */ }
      el.remove();
    };
  }, [ref, track, show, mirror]);
}

/** Tracks whether the other person currently has their camera switched on. */
function useRemoteVideoOn(track: RemoteVideoTrack | null) {
  const [on, setOn] = useState(() => !!track?.isEnabled);
  useEffect(() => {
    if (!track) {
      setOn(false);
      return;
    }
    setOn(track.isEnabled);
    const enabled = () => setOn(true);
    const disabled = () => setOn(false);
    track.on("enabled", enabled);
    track.on("disabled", disabled);
    return () => {
      track.off("enabled", enabled);
      track.off("disabled", disabled);
    };
  }, [track]);
  return on;
}

/**
 * Floating handle for a call that's still running while the user is on
 * another screen. Video calls show BOTH people (the other person large, you
 * as an inset), with a small strip underneath for mute / end call. Voice
 * calls stay a compact round avatar. Tap the window to return to the full
 * call; drag it out of the way and it snaps to the nearest side.
 */
export default function FloatingCallBubble({
  isVideo,
  other,
  status,
  endLabel,
  reconnecting = false,
  poorNetwork = false,
  seconds,
  remoteVideoTrack,
  localVideoTrack,
  localVideoEnabled,
  muted,
  onToggleMute,
  onEndCall,
  onOpen,
}: Props) {
  const online = useIsOnline();
  const [vs, setVs] = useState(videoSize);
  const W = isVideo ? vs.w : 64;
  const H = isVideo ? vs.h + STRIP_H : 64;

  const remoteRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const remoteOn = useRemoteVideoOn(remoteVideoTrack);
  const connected = status === "connected";
  const showRemote = isVideo && connected && !!remoteVideoTrack && remoteOn;
  const showLocal = isVideo && !!localVideoTrack && localVideoEnabled;
  useAttachedVideo(remoteRef, remoteVideoTrack, showRemote);
  useAttachedVideo(localRef, localVideoTrack, showLocal, true);

  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: window.innerWidth - W - MARGIN,
    y: Math.round(window.innerHeight * 0.18),
  }));
  const drag = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);

  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.min(Math.max(MARGIN, x), window.innerWidth - W - MARGIN),
      y: Math.min(Math.max(MARGIN, y), window.innerHeight - H - MARGIN),
    }),
    [W, H],
  );

  // Keep it on screen when its size changes (voice → video) or on rotate.
  useEffect(() => {
    const fit = () => {
      setVs(videoSize());
      setPos((p) => clamp(p.x, p.y));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) d.moved = true;
    if (d.moved) setPos(clamp(d.ox + dx, d.oy + dy));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!d) return;
    if (!d.moved) {
      onOpen();
      return;
    }
    // Snap to whichever side is closer.
    setPos((p) => {
      const left = p.x + W / 2 < window.innerWidth / 2;
      return clamp(left ? MARGIN : window.innerWidth - W - MARGIN, p.y);
    });
  };

  const label =
    !online && status !== "ended" ? tNow("login.offlineTitle") :
    status === "connected" ? (reconnecting ? (poorNetwork ? tNow("ch.poorNetwork") : tNow("ch.reconnecting")) : fmt(seconds)) : status === "ended" ? (endLabel ?? tNow("fb.ended")) : status === "ringing" ? tNow("fb.calling") : tNow("fb.connecting");
  const name = other?.display_name ?? tNow("chat.contact");

  // Buttons in the strip must not start a drag or reopen the call.
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

  if (!isVideo) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={tNow("fb.returnTo", { name })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        style={{ left: pos.x, top: pos.y, width: W, height: H, touchAction: "none" }}
        className="fixed z-[60] select-none cursor-pointer shadow-xl transition-[left] duration-150 rounded-full"
      >
        <div className="relative w-full h-full pointer-events-none">
          <span
            className={`absolute -inset-1 rounded-full ring-2 ring-primary ${connected ? "animate-pulse" : ""}`}
          />
          <Avatar className="w-full h-full">
            <AvatarImage src={other?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground text-base font-semibold">
              {initials(other?.display_name)}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground text-2xs font-semibold px-1.5 py-0.5 whitespace-nowrap">
            <Phone className="w-2.5 h-2.5" />
            {label}
          </span>
        </div>
      </div>
    );
  }

  const insetW = Math.round(vs.w * 0.36);
  const insetH = Math.round((insetW * 4) / 3);

  return (
    <div
      style={{ left: pos.x, top: pos.y, width: W, height: H, touchAction: "none" }}
      className="fixed z-[60] select-none shadow-2xl rounded-2xl overflow-hidden bg-black ring-2 ring-primary transition-[left] duration-150 flex flex-col"
    >
      {/* Video area: drag to move, tap to return to the full call. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={tNow("fb.returnToVideo", { name })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        style={{ height: vs.h }}
        className="relative w-full cursor-pointer"
      >
        {/* The other person, full size */}
        <div ref={remoteRef} data-testid="pip-remote" className="absolute inset-0 pointer-events-none" />
        {!showRemote && (
          <div data-testid="pip-remote-placeholder" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-900 text-white pointer-events-none">
            <Avatar className="w-14 h-14">
              <AvatarImage src={other?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                {initials(other?.display_name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-2xs font-medium opacity-90 flex items-center gap-1">
              {connected ? <><VideoOff className="w-3 h-3" /> {tNow("fb.cameraOff")}</> : label}
            </span>
          </div>
        )}

        {/* You, as a small inset in the corner */}
        <div
          style={{ width: insetW, height: insetH }}
          className="absolute right-1.5 bottom-1.5 rounded-lg overflow-hidden border border-white/70 bg-neutral-800 shadow-md pointer-events-none"
        >
          <div ref={localRef} data-testid="pip-local" className="absolute inset-0" />
          {!showLocal && (
            <div data-testid="pip-local-placeholder" className="absolute inset-0 flex flex-col items-center justify-center text-white/90 text-[9px] font-medium gap-0.5">
              <VideoOff className="w-3.5 h-3.5" />
              You
            </div>
          )}
        </div>

        <span className="absolute top-1.5 left-1.5 rounded-md bg-black/55 text-white text-2xs font-semibold px-1.5 py-0.5 pointer-events-none">
          {label}
        </span>
      </div>

      {/* Controls strip, below the video so it never covers a face */}
      <div style={{ height: STRIP_H }} className="flex items-center justify-between gap-1 px-2 bg-neutral-950 text-white">
        <span className="flex items-center gap-1 min-w-0 text-2xs font-medium">
          <Video className="w-3 h-3 shrink-0 text-accent" />
          <span className="truncate">{name}</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            aria-label={muted ? tNow("cc.unmute") : tNow("cc.mute")}
            onPointerDown={stop}
            onPointerUp={stop}
            onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
            className={`w-7 h-7 rounded-full flex items-center justify-center ${muted ? "bg-white text-neutral-900" : "bg-white/15 text-white"}`}
          >
            {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            aria-label={tNow("cc.endCall")}
            onPointerDown={stop}
            onPointerUp={stop}
            onClick={(e) => { e.stopPropagation(); onEndCall(); }}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-destructive text-destructive-foreground"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>
    </div>
  );
}
