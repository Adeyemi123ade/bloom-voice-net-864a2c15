import { useEffect, useRef } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getActiveCall, minimizeTarget } from "@/lib/activeCall";
import { isLockedCall } from "@/lib/lockedCall";
import { moveAppToBackground } from "@/lib/nativeCalls";

/**
 * The one Android Back (button, gesture) handler for the app.
 *
 *  - A screen with an earlier screen behind it: go back to it.
 *  - A screen opened with nothing behind it (notification, fresh launch):
 *    go to its parent, the dashboard, so Back is never dead.
 *  - The dashboard (/home) while signed in: leave the app the standard
 *    Android way. Only the activity is closed; the session and data stay, so
 *    reopening the app finds the person still signed in. While a call is
 *    running the app is hidden instead (like Home), so the call keeps going.
 *  - Signed out on the first screens: leave the app too.
 */
export const DASHBOARD_ROUTE = "/home";
const UNAUTH_EXIT_ROUTES = new Set(["/", "/welcome", "/login"]);

export type BackAction =
  | { kind: "ignore" }
  | { kind: "navigate-back" }
  | { kind: "navigate-to"; to: string }
  | { kind: "exit" }
  | { kind: "hide" };

/** Pure decision, so every case can be tested. */
export function decideBackAction(i: {
  path: string;
  signedIn: boolean;
  historyIdx: number;
  callRunning: boolean;
}): BackAction {
  const { path, signedIn, historyIdx } = i;
  if (signedIn) {
    if (path === DASHBOARD_ROUTE) return i.callRunning ? { kind: "hide" } : { kind: "exit" };
    if (path.startsWith("/call/")) return { kind: "ignore" }; // handled with the call's own target
    return historyIdx > 0 ? { kind: "navigate-back" } : { kind: "navigate-to", to: DASHBOARD_ROUTE };
  }
  if (UNAUTH_EXIT_ROUTES.has(path)) return { kind: "exit" };
  return historyIdx > 0 ? { kind: "navigate-back" } : { kind: "navigate-to", to: "/" };
}

export function useBackButtonGuard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // The listener is registered once. Everything it reads goes through refs,
  // so it is always current and is never re-registered on navigation (a
  // re-registration could briefly leave two listeners, or none).
  const locationRef = useRef(location);
  locationRef.current = location;
  const userRef = useRef(user);
  userRef.current = user;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const subPromise = CapacitorApp.addListener("backButton", () => {
      const loc = locationRef.current;
      const path = loc.pathname;
      const signedIn = !!userRef.current;
      const nav = navigateRef.current;

      // On the call screen, Back minimises the call: it keeps running and a
      // floating bubble brings the user back to it.
      if (signedIn && path.startsWith("/call/")) {
        // A call answered on the locked phone stays on its call screen:
        // minimising would show the app over the lock screen.
        const callId = new URLSearchParams(loc.search).get("callId");
        if (callId && isLockedCall(callId)) return;
        const t = minimizeTarget(path.slice("/call/".length), loc.state);
        if ("back" in t) nav(-1);
        else nav(t.to, { replace: true });
        return;
      }

      const action = decideBackAction({
        path,
        signedIn,
        historyIdx: (window.history.state as { idx?: number } | null)?.idx ?? 0,
        callRunning: !!getActiveCall(),
      });
      switch (action.kind) {
        case "navigate-back":
          nav(-1);
          break;
        case "navigate-to":
          nav(action.to, { replace: true });
          break;
        case "hide":
          // An older app build can't hide itself; closing would end the call.
          void moveAppToBackground();
          break;
        case "exit":
          void CapacitorApp.exitApp();
          break;
        default:
          break;
      }
    });

    return () => {
      void subPromise.then((sub) => sub.remove());
    };
  }, []);
}
