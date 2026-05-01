import { forwardRef, useEffect, useRef, useState, useCallback } from "react";

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
 * PiP tile is draggable anywhere on the screen. A click without drag swaps
 * the big/small feeds; a drag just repositions the tile.
 */
const RemoteMedia = forwardRef<HTMLDivElement, Props>(
  ({ showVideo, localPreviewRef, remoteVideoRef, remoteAudioRef, swapped = false, onSwap }, _ref) => {
    // PiP dimensions (reduced ~130% from 288x384 → ~125x167)
    const PIP_W = 150;
    const PIP_H = 200;
    const MARGIN = 8;

    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const draggingRef = useRef(false);
    const movedRef = useRef(false);
    const startRef = useRef<{ px: number; py: number; ox: number; oy: number }>({
      px: 0, py: 0, ox: 0, oy: 0,
    });

    // Initialise position to bottom-right once we know viewport size.
    useEffect(() => {
      if (!showVideo) return;
      if (pos) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos({
        x: vw - PIP_W - 16,
        y: vh - PIP_H - 176, // sit above the controls bar
      });
    }, [showVideo, pos]);

    // Keep PiP on-screen if viewport resizes.
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
            {/* Full-bleed big stage — sits behind header & controls */}
            <div className="fixed inset-0 z-0 bg-black">
              <div
                ref={swapped ? localPreviewRef : remoteVideoRef}
                className="absolute inset-0"
              />
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
              <div
                ref={swapped ? remoteVideoRef : localPreviewRef}
                className="absolute inset-0 pointer-events-none"
              />
            </div>
          </>
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
