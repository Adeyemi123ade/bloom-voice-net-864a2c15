import { useBackButtonGuard } from "@/hooks/useBackButtonGuard";

// Invisible — registers the Android hardware/gesture back-button handler
// for the lifetime of the app. See useBackButtonGuard.ts for why this
// exists: without it, back silently exits the app even while signed in.
export default function BackButtonGuard() {
  useBackButtonGuard();
  return null;
}
