import { Capacitor } from "@capacitor/core";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Android (the app, or a browser on an Android phone) always has a system
 * Back action. iPhone and desktop browsers don't offer one the user can rely
 * on, so they keep the in-app back arrow.
 */
export function hasSystemBack(): boolean {
  if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === "android";
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

/**
 * Back arrow behaviour for detail screens.
 *
 * - showBackArrow: hidden on Android when there's an earlier in-app screen
 *   for system Back to return to. Still shown if the screen was opened
 *   directly (link, notification, fresh tab), because then system Back would
 *   leave the app and, without a bottom nav, the user would be stranded.
 * - goBack: steps back in history, or goes to `fallback` if there's nothing
 *   in-app to go back to (navigate(-1) would otherwise do nothing or leave).
 */
export function useBackNavigation(fallback: string) {
  const navigate = useNavigate();
  useLocation(); // re-evaluate on navigation
  const idx = (typeof window !== "undefined"
    ? (window.history.state as { idx?: number } | null)?.idx
    : 0) ?? 0;
  const hasHistory = idx > 0;
  return {
    showBackArrow: !(hasSystemBack() && hasHistory),
    goBack: () => (hasHistory ? navigate(-1) : navigate(fallback, { replace: true })),
  };
}
