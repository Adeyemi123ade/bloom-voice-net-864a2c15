import { forwardRef, useEffect, useRef, useState, useCallback } from "react";
import type { LocalVideoTrack, RemoteVideoTrack } from "twilio-video";

type AttachableVideoTrack = LocalVideoTrack | RemoteVideoTrack;

type Props = {
  showVideo: boolean;
  /** Local camera track (your own preview). */
  localVideoTrack: AttachableVideoTrack | null;
  /** Remote camera track (the other party). */
  remoteVideoTrack: AttachableVideoTrack | null;
  /**
   * Optional. When omitted the caller owns the remote <audio> element (the
   * call session keeps it mounted for the whole call, so audio continues
   * while the call screen is minimised).
   */
  remoteAudioRef?: React.RefObject<HTMLAudioElement>;
  /** When true, swap which video is shown big vs in the small PiP tile. */
  swapped?: boolean;
  onSwap?: () => void;
};

/**
 * Owns DOM attachment for both video tracks so swap / drag / re-renders
 * never lose a track. Big stage shows the remote feed (or local if swapped),
 * PiP shows the other one. Tap the PiP to swap; drag to reposition.
 */
const RemoteMedia = forwardRef<HTMLDivElement, Props>(
  ({ showVideo, localVideoTrack, remoteVideoTrack, remoteAudioRef, swapped = false, onSwap }, _ref) => {
    const PIP_W = 150;
    const PIP_H = 200;
    const MARGIN = 8;

    const bigRef = useRef<HTMLDivElement>(null);
    const pipRef = useRef<HTMLDivElement>(null);

    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const draggingRef = useRef(false);
    const movedRef = useRef(false);
    const startRef = useRef<{ px: number; py: number; ox: number; oy: number }>({
      px: 0, py: 0, ox: 0, oy: 0,
    });

    // Decide which track goes where.
    const bigTrack = swapped ? localVideoTrack : remoteVideoTrack;
    const pipTrack = swapped ? remoteVideoTrack : localVideoTrack;

    // Generic attach helper — clears the container then attaches the track
    // as a styled <video> element. Returns a cleanup that detaches the track.
    const attachTrackTo = useCallback(
      (container: HTMLDivElement | null, track: AttachableVideoTrack | null, mutedEl: boolean) => {
        if (!container) return () => {};
        container.innerHTML = "";
        if (!track) return () => {};
        const el = (track as unknown as { attach: () => HTMLVideoElement }).attach();
        el.style.width = "100%";
        el.style.height = "100%";
        el.style.objectFit = "cover";
        el.setAttribute("playsinline", "true");
        el.muted = mutedEl;
        container.appendChild(el);
        return () => {
          try {
            (track as unknown as { detach: (el: HTMLMediaElement) => HTMLMediaElement[] }).detach(el);
          } catch { /* ignore */ }
          if (el.parentNode) el.parentNode.removeChild(el);
        };
      },
      [],
    );

    // Re-attach whenever showVideo flips, swap toggles, or a track changes.
    useEffect(() => {
      if (!showVideo) return;
      const cleanupBig = attachTrackTo(bigRef.current, bigTrack, /*mutedEl*/ swapped /* big shows local? mute it */);
      const cleanupPip = attachTrackTo(pipRef.current, pipTrack, /*mutedEl*/ !swapped /* pip shows local? mute it */);
      return () => {
        cleanupBig();
        cleanupPip();
      };
    }, [showVideo, swapped, bigTrack, pipTrack, attachTrackTo]);

    // Initialise PiP position to bottom-right once we know viewport size.
    useEffect(() => {
      if (!showVideo) return;
      if (pos) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos({
        x: vw - PIP_W - 16,
        y: vh - PIP_H - 176,
      });
    }, [showVideo, pos]);

    useEffect(() => {
      const onResize = () => {
        setPos((p) => {
          if (!p) return p;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          return {
            x: Math.min(Math.max(MARGIN, p.x), vw - PIP_W - MARGIN),
            y: Math.min(Math.max(MARGIN, p.y), vh - PIP_H - MARGIN),
          };
        });
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
      if (!pos) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = true;
      movedRef.current = false;
      startRef.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
    }, [pos]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - startRef.current.px;
      const dy = e.clientY - startRef.current.py;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos({
        x: Math.min(Math.max(MARGIN, startRef.current.ox + dx), vw - PIP_W - MARGIN),
        y: Math.min(Math.max(MARGIN, startRef.current.oy + dy), vh - PIP_H - MARGIN),
      });
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
      const wasDragging = draggingRef.current;
      const moved = movedRef.current;
      draggingRef.current = false;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (wasDragging && !moved) onSwap?.();
    }, [onSwap]);

    return (
      <>
        {showVideo ? (
          <>
            {/* Full-bleed big stage */}
            <div className="fixed inset-0 z-0 bg-black">
              <div ref={bigRef} className="absolute inset-0" />
            </div>
            {/* Draggable PiP tile — drag to reposition, tap to swap */}
            <div
              role="button"
              aria-label="Swap video (drag to move)"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                left: pos?.x ?? 0,
                top: pos?.y ?? 0,
                width: PIP_W,
                height: PIP_H,
                touchAction: "none",
                visibility: pos ? "visible" : "hidden",
              }}
              className="fixed z-30 rounded-xl bg-secondary border border-border overflow-hidden shadow-lg cursor-grab active:cursor-grabbing select-none"
            >
              <div ref={pipRef} className="absolute inset-0 pointer-events-none" />
            </div>
          </>
        ) : null}
        {remoteAudioRef && (
          <audio
            ref={remoteAudioRef}
            autoPlay
            playsInline
            {...({ "webkit-playsinline": "true" } as Record<string, string>)}
            className="hidden"
          />
        )}
      </>
    );
  },
);

RemoteMedia.displayName = "RemoteMedia";
export default RemoteMedia;
