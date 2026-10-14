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
  // See the matching comment in SwipeRow: mobile browsers fire a synthetic
  // mousedown/click shortly after a real touchend, which would otherwise
  // reset `fired` and let the synthetic click re-toggle the selection that
  // the real long-press just made.
  const touchActive = useRef(false);
  const touchEndTimer = useRef<number | null>(null);
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
  const onTouchStart = () => {
    touchActive.current = true;
    if (touchEndTimer.current) {
      window.clearTimeout(touchEndTimer.current);
      touchEndTimer.current = null;
    }
    start();
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    cancel();
    // Only swallow the browser's synthetic mousedown/mouseup/click when this
    // touch actually fired the long-press — preventDefault() on touchend
    // suppresses the click for a PLAIN tap too (confirmed via CDP touch
    // dispatch: no click event follows), and onTap (tap-to-add-to-selection,
    // tap-to-jump-in-search) has no other way to fire on a real touchscreen.
    // Doing this unconditionally was silently killing that on every mobile
    // browser while working fine on desktop, where clicks aren't synthesized
    // from touch at all.
    if (fired.current && e.cancelable) e.preventDefault();
    touchEndTimer.current = window.setTimeout(() => {
      touchActive.current = false;
    }, 700);
  };
  return (
    <div
      className={`flex ${mine ? "justify-end" : "justify-start"}`}
      onClick={(e) => {
        e.stopPropagation();
        if (fired.current) { fired.current = false; return; }
        onTap();
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={cancel}
      onMouseDown={() => { if (!touchActive.current) start(); }}
      onMouseUp={() => { if (!touchActive.current) cancel(); }}
      onMouseLeave={() => { if (!touchActive.current) cancel(); }}
      onContextMenu={(e) => {
        // Android Chrome sends contextmenu at ~400ms of holding, just before
        // our own 450ms timer. Cancel that timer so one press selects once;
        // letting both fire selected and then unselected the message (the
        // "flash" on long-press).
        e.preventDefault();
        cancel();
        if (!fired.current) { fired.current = true; onLongPress(); }
      }}
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
  // Mobile browsers fire synthetic compatibility mouse events (mousedown,
  // mouseup, click) shortly AFTER a real touch sequence ends, so code that
  // only listens for mouse events still works. Without this guard, that
  // synthetic mousedown hits the same onMouseDown as a real mouse user
  // would and calls startLongPress() again, which resets longPressFired
  // back to false — right before the matching synthetic click arrives and
  // (seeing longPressFired now false) falls through to onTap, instantly
  // re-toggling off the selection long-press just made.
  const touchActive = useRef(false);
  const touchEndTimer = useRef<number | null>(null);
  const THRESHOLD = 60;

  const fireLongPress = () => {
    longPressFired.current = true;
    triggered.current = false;
    setDx(0);
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
    touchActive.current = true;
    if (touchEndTimer.current) {
      window.clearTimeout(touchEndTimer.current);
      touchEndTimer.current = null;
    }
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
    // Once long-press has already engaged (selection mode is active for
    // this message), stop reading further finger movement as a swipe —
    // otherwise ordinary hand tremor while holding gets misread as
    // "swipe to reply" and firing that on release immediately clears the
    // selection that was just made, looking like the action bar "blinks"
    // and reverts.
    if (longPressFired.current) return;
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
  const onTouchEnd = (e: React.TouchEvent) => {
    cancelLongPress();
    const wasSwipeReply = triggered.current && !longPressFired.current;
    if (wasSwipeReply) onReply();
    setDx(0);
    startX.current = null;
    startY.current = null;
    // Only swallow the browser's synthetic mousedown/mouseup/click when this
    // touch already did something itself (fired the long-press, or
    // completed a swipe-to-reply) — preventDefault() on touchend suppresses
    // the click for a PLAIN tap too (confirmed via CDP touch dispatch: no
    // click event follows), and onTap (tap-to-add-to-selection,
    // tap-to-jump-in-search) has no other way to fire on a real touchscreen.
    // Doing this unconditionally was silently killing that on every mobile
    // browser while working fine on desktop, where clicks aren't synthesized
    // from touch at all.
    if ((longPressFired.current || wasSwipeReply) && e.cancelable) e.preventDefault();
    // Keep ignoring mouse events for a beat after the real touch ends —
    // the synthetic compatibility events land shortly after touchend, not
    // during it.
    touchEndTimer.current = window.setTimeout(() => {
      touchActive.current = false;
    }, 700);
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
        onMouseDown={() => { if (!touchActive.current) startLongPress(); }}
        onMouseUp={() => { if (!touchActive.current) cancelLongPress(); }}
        onMouseLeave={() => { if (!touchActive.current) cancelLongPress(); }}
        onContextMenu={(e) => {
          // See CallRow: cancel our own pending timer so the browser's
          // contextmenu and the timer can't both fire for one press.
          e.preventDefault();
          cancelLongPress();
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
