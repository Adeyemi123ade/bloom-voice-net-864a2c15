import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, Video } from "lucide-react";
import type { RemoteVideoTrack } from "twilio-video";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

type Props = {
  isVideo: boolean;
  other: Profile | null;
  status: "connecting" | "ringing" | "connected" | "ended";
  seconds: number;
  remoteVideoTrack: RemoteVideoTrack | null;
  onOpen: () => void;
};

const MARGIN = 10;

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

/**
 * Small floating handle for a call that's still running while the user is
 * on another screen. One tap returns to the full call. It can be dragged
 * out of the way and snaps to the nearest side so it never sits on top of
 * whatever the user is trying to tap.
 */
export default function FloatingCallBubble({ isVideo, other, status, seconds, remoteVideoTrack, onOpen }: Props) {
  const showVideo = isVideo && status === "connected" && !!remoteVideoTrack;
  const W = showVideo ? 96 : 64;
  const H = showVideo ? 136 : 64;

  const videoRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: window.innerWidth - W - MARGIN,
    y: Math.round(window.innerHeight * 0.3),
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
    const fit = () => setPos((p) => clamp(p.x, p.y));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [clamp]);

  // Show the other person's live video in the bubble. Twilio tracks can be
  // attached to several elements, so this doesn't disturb the call itself.
  useEffect(() => {
    const box = videoRef.current;
    if (!showVideo || !box || !remoteVideoTrack) return;
    const el = remoteVideoTrack.attach();
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.objectFit = "cover";
    el.setAttribute("playsinline", "true");
    el.muted = true;
    box.appendChild(el);
    return () => {
      try { remoteVideoTrack.detach(el); } catch { /* ignore */ }
      el.remove();
    };
  }, [showVideo, remoteVideoTrack]);

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
    status === "connected" ? fmt(seconds) : status === "ended" ? "Ended" : status === "ringing" ? "Calling" : "…";
  const Icon = isVideo ? Video : Phone;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Return to call with ${other?.display_name ?? "contact"}`}
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
      className={`fixed z-[60] select-none cursor-pointer shadow-xl transition-[left] duration-150 ${
        showVideo ? "rounded-2xl overflow-hidden bg-black ring-2 ring-primary" : "rounded-full"
      }`}
    >
      {showVideo ? (
        <>
          <div ref={videoRef} className="absolute inset-0 pointer-events-none" />
          <span className="absolute bottom-1 inset-x-1 rounded-md bg-black/60 text-white text-2xs font-medium text-center py-0.5 pointer-events-none">
            {label}
          </span>
        </>
      ) : (
        <div className="relative w-full h-full pointer-events-none">
          <span
            className={`absolute -inset-1 rounded-full ring-2 ring-primary ${status === "connected" ? "animate-pulse" : ""}`}
          />
          <Avatar className="w-full h-full">
            <AvatarImage src={other?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground text-base font-semibold">
              {initials(other?.display_name)}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground text-2xs font-semibold px-1.5 py-0.5 whitespace-nowrap">
            <Icon className="w-2.5 h-2.5" />
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
