import { useRef, useCallback } from "react";

/**
 * Returns event handlers that fire `onLongPress` after `ms` of holding down
 * (mouse or touch). Cancels on movement, leave, or release.
 */
export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);

  const start = useCallback(() => {
    fired.current = false;
    timer.current = window.setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, ms);
  }, [onLongPress, ms]);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  return {
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onContextMenu: (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!fired.current) onLongPress();
    },
    didFire: () => fired.current,
  };
}
