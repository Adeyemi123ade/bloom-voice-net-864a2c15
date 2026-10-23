import { useCallback, useEffect, useRef, useState } from "react";

/** Farther than this from the newest message: show the jump-to-latest button. */
export const JUMP_SHOW_PX = 240;
/** Closer than this to the newest message: no floating date (today is in view anyway). */
const PILL_MIN_PX = 80;
/** How long the floating date stays after scrolling stops. */
export const PILL_HIDE_MS = 1200;
/** The floating date sits this far below the top of the list; the item under it is the one dated. */
const PILL_LINE_PX = 44;
/** After a jump, keep following the bottom while late photos or messages grow the list. */
const PIN_MS = 2500;

/**
 * Scroll helpers for the chat list, all from the one existing scroll
 * container (no second scroller):
 * - activeDay: the day of the item currently under the top of the visible
 *   area (from each row's data-day), for the floating date;
 * - pillVisible: true while scrolling, gone shortly after it stops;
 * - showJump / jumpToLatest: the round button that goes to the newest item,
 *   even if photos or messages are still loading and make the list grow.
 */
export function useChatScrollAids(scrollRef: React.RefObject<HTMLDivElement>, contentVersion: unknown) {
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [pillVisible, setPillVisible] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const frame = useRef(0);
  const hideTimer = useRef<number | null>(null);
  const pinUntil = useRef(0);
  const pinFrame = useRef(0);

  const distanceFromBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight;

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = distanceFromBottom(el);
    setShowJump(dist > JUMP_SHOW_PX);
    if (dist <= PILL_MIN_PX) setPillVisible(false);
    const rows = el.querySelectorAll<HTMLElement>("[data-day]");
    if (!rows.length) {
      setActiveDay(null);
      return;
    }
    // Rows are in time order: find the first one whose bottom is below the line.
    const line = el.getBoundingClientRect().top + PILL_LINE_PX;
    let lo = 0;
    let hi = rows.length - 1;
    let found = rows.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].getBoundingClientRect().bottom > line) {
        found = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    setActiveDay(rows[found].dataset.day ?? null);
  }, [scrollRef]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        measure();
      });
    }
    if (distanceFromBottom(el) > PILL_MIN_PX) {
      setPillVisible(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setPillVisible(false), PILL_HIDE_MS);
    }
  }, [scrollRef, measure]);

  const stopPin = useCallback(() => {
    pinUntil.current = 0;
    if (pinFrame.current) cancelAnimationFrame(pinFrame.current);
    pinFrame.current = 0;
  }, []);

  /** Straight to the newest item, and stay there while late content loads. */
  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setShowJump(false);
    setPillVisible(false);
    pinUntil.current = Date.now() + PIN_MS;
    const follow = () => {
      const node = scrollRef.current;
      if (!node || Date.now() > pinUntil.current) {
        pinFrame.current = 0;
        return;
      }
      if (distanceFromBottom(node) > 1) node.scrollTop = node.scrollHeight;
      pinFrame.current = requestAnimationFrame(follow);
    };
    if (pinFrame.current) cancelAnimationFrame(pinFrame.current);
    pinFrame.current = requestAnimationFrame(follow);
  }, [scrollRef]);

  // The person scrolling by hand ends the follow-the-bottom after a jump.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cancel = () => stopPin();
    el.addEventListener("wheel", cancel, { passive: true });
    el.addEventListener("touchstart", cancel, { passive: true });
    el.addEventListener("keydown", cancel);
    return () => {
      el.removeEventListener("wheel", cancel);
      el.removeEventListener("touchstart", cancel);
      el.removeEventListener("keydown", cancel);
    };
  }, [scrollRef, stopPin]);

  // New or older messages, photos loading: the button and date follow.
  useEffect(() => {
    measure();
  }, [contentVersion, measure]);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (pinFrame.current) cancelAnimationFrame(pinFrame.current);
    },
    [],
  );

  return { activeDay, pillVisible, showJump, onScroll, jumpToLatest };
}
