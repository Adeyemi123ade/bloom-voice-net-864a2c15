import { useEffect, useRef } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// Nothing in this app previously listened for the Android hardware/gesture
// back button. Capacitor's default behavior when a WebView has no more
// in-app history left is to exit the app outright — so a signed-in user on
// their dashboard, one back-press from the OS home screen with no
// confirmation, was one accidental tap from being dropped out of the app
// entirely. Once signed in there is no scenario where "outside the app" is
// the right destination for Back; the only exit is an explicit sign-out.
const AUTH_ROOT_ROUTE = "/home";
const UNAUTH_EXIT_ROUTES = new Set(["/", "/welcome", "/login"]);

export function useBackButtonGuard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Registering this listener replaces Capacitor's default back behavior
  // entirely — the values it reads must always be current, not stale
  // closures from the render that registered it.
  const locationRef = useRef(location);
  locationRef.current = location;
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const subPromise = CapacitorApp.addListener("backButton", () => {
      const path = locationRef.current.pathname;
      const signedIn = !!userRef.current;

      if (signedIn) {
        // Never exit the app while signed in — only step back within it.
        // The dashboard is the floor; staying there is correct, not a bug.
        if (path === AUTH_ROOT_ROUTE) return;
        navigate(-1);
        return;
      }

      // Signed out: back is allowed to exit once there's nowhere in-app
      // left to go — normal, expected mobile behavior for a logged-out user.
      if (UNAUTH_EXIT_ROUTES.has(path)) {
        CapacitorApp.exitApp();
        return;
      }
      navigate(-1);
    });

    return () => { subPromise.then((sub) => sub.remove()); };
  }, [navigate]);
}
