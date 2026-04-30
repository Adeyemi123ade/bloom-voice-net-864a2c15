import { useRef, useState } from "react";
import { Reply } from "lucide-react";

// Long-press wrapper for call bubbles (no swipe-to-reply).
export function CallRow({
  mine,
  isSelected,
  onTap,
  onLongPress,
  children,
}: {
  mine: boolean;
  isSelected: boolean;
  onTap: () => void;
  onLongPress: () => void;
  children: React.ReactNode;
}) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = () => {
    fired.current = false;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      fired.current = true;
      try { (navigator as any).vibrate?.(20); } catch { /* ignore */ }
      onLongPress();
    }, 450);
  };
  const cancel = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  return (
    <div
      className={`flex ${mine ? "justify-end" : "justify-start"}`}
      onClick={(e) => {
        e.stopPropagation();
        if (fired.current) { fired.current = false; return; }
        onTap();
      }}
      onTouchStart={start}
      onTouchEnd={cancel}
      onTouchMove={cancel}
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onContextMenu={(e) => { e.preventDefault(); if (!fired.current) { fired.current = true; onLongPress(); } }}
    >
      <div className={isSelected ? "ring-2 ring-primary rounded-2xl" : ""}>
        {children}
      </div>
    </div>
  );
}

// Swipe-to-reply + long-press wrapper (WhatsApp-style)
export function SwipeRow({
  mine,
  onReply,
  onTap,
  onLongPress,
  children,
}: {
  mine: boolean;
  onReply: () => void;
  onTap: (e: React.MouseEvent) => void;
  onLongPress?: () => void;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const triggered = useRef(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const THRESHOLD = 60;

  const fireLongPress = () => {
    longPressFired.current = true;
    try { (navigator as any).vibrate?.(20); } catch { /* ignore */ }
    onLongPress?.();
  };
  const startLongPress = () => {
    longPressFired.current = false;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(fireLongPress, 450);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    triggered.current = false;
    startLongPress();
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null || startY.current == null) return;
    const dxRaw = e.touches[0].clientX - startX.current;
    const dyRaw = e.touches[0].clientY - startY.current;
    if (Math.abs(dxRaw) > 6 || Math.abs(dyRaw) > 6) cancelLongPress();
    if (Math.abs(dyRaw) > Math.abs(dxRaw)) return;
    if (dxRaw <= 0) {
      setDx(0);
      return;
    }
    const clamped = Math.min(dxRaw, 90);
    setDx(clamped);
    if (clamped >= THRESHOLD && !triggered.current) {
      triggered.current = true;
      try { (navigator as any).vibrate?.(15); } catch { /* ignore */ }
    }
  };
  const onTouchEnd = () => {
    cancelLongPress();
    if (triggered.current) onReply();
    setDx(0);
    startX.current = null;
    startY.current = null;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (longPressFired.current) {
      // Suppress click that would otherwise toggle selection right after long-press.
      longPressFired.current = false;
      e.stopPropagation();
      return;
    }
    onTap(e);
  };

  const progress = Math.min(dx / THRESHOLD, 1);

  return (
    <div className={`relative flex ${mine ? "justify-end" : "justify-start"}`} onClick={handleClick}>
      <div
        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center pointer-events-none"
        style={{ opacity: progress, transform: `translateY(-50%) scale(${0.6 + progress * 0.4})` }}
      >
        <Reply className="w-4 h-4 text-primary" />
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={startLongPress}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!longPressFired.current) fireLongPress();
        }}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dx === 0 ? "transform 180ms ease-out" : "none",
        }}
        className={`flex ${mine ? "justify-end" : "justify-start"} w-full`}
      >
        {children}
      </div>
    </div>
  );
}
