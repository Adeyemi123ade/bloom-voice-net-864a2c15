import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";

/**
 * Register the device for FCM push notifications and store the token in
 * Supabase so the backend can wake this device with a high-priority push
 * when an incoming app-to-app call arrives.
 *
 * Web / no-op on non-native platforms — push wake-up only matters on Android.
 */

let registered = false;
let pushReady = false;
let lastProblem: string | null = null;

/** For the Call setup check: why push isn't ready on this phone, if known. */
export function getPushProblem(): string | null {
  return lastProblem;
}

/** Ask again (e.g. after the user allowed notifications in Settings). */
export async function retryCallPush(userId: string): Promise<boolean> {
  registered = false;
  pushReady = false;
  lastProblem = null;
  await registerForCallPush(userId);
  // Firebase answers through a listener: wait for it, up to 15 s.
  for (let i = 0; i < 30 && !pushReady && !lastProblem; i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!pushReady && !lastProblem) {
    lastProblem =
      "No answer from Firebase. Check the phone is online. If it keeps happening, this app build may be missing its Firebase settings file (google-services.json): rebuild the app.";
  }
  return pushReady;
}

const TOKEN_KEY = "chichat:fcm-token";

/**
 * Before signing out: remove this phone's push token, so it stops receiving
 * this account's calls and messages, and so the next account to sign in on
 * the phone can register it (the token row belongs to one user at a time).
 */
export async function unregisterCallPush(): Promise<void> {
  registered = false;
  pushReady = false;
  let token: string | null = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch { /* ignore */ }
  if (!token) return;
  try {
    await supabase.from("device_push_tokens").delete().eq("fcm_token", token);
    localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

/** True once this phone has a push token saved, so calls can wake it. */
export function isCallPushReady(): boolean {
  return pushReady;
}

export async function registerForCallPush(userId: string) {
  if (registered) return;
  if (!Capacitor.isNativePlatform()) return;
  registered = true;

  try {
    // A retry must not stack a second set of listeners on top of the first.
    await PushNotifications.removeAllListeners();
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      console.warn("[fcm] push permission denied");
      lastProblem = "Notifications are turned off for ChiChat.";
      registered = false;
      return;
    }

    PushNotifications.addListener("registration", async (token) => {
      try {
        const { error } = await supabase.from("device_push_tokens").upsert(
          {
            user_id: userId,
            fcm_token: token.value,
            platform: Capacitor.getPlatform(),
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "fcm_token" },
        );
        // Supabase reports failures in `error` rather than throwing.
        if (error) {
          console.warn("[fcm] failed to store token", error);
          lastProblem = `Couldn't save this phone for calls (${error.message}).`;
        }
        else {
          pushReady = true;
          lastProblem = null;
          try { localStorage.setItem(TOKEN_KEY, token.value); } catch { /* ignore */ }
        }
      } catch (e) {
        console.warn("[fcm] failed to store token", e);
        lastProblem = `Couldn't save this phone for calls (${e instanceof Error ? e.message : "network error"}).`;
      }
    });

    PushNotifications.addListener("registrationError", (e) => {
      console.warn("[fcm] registration error", e);
      lastProblem = `Firebase couldn't register this phone (${e?.error ?? "unknown error"}).`;
    });

    // Incoming data-only call push → app foregrounds, IncomingCallScreen
    // takes over from the realtime subscription on the `calls` table.
    PushNotifications.addListener("pushNotificationReceived", (n) => {
      console.log("[fcm] push received", n.data);
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
      console.log("[fcm] push tapped", a.notification.data);
    });

    await PushNotifications.register();
  } catch (e) {
    console.warn("[fcm] setup failed", e);
    lastProblem = `Couldn't start push registration (${e instanceof Error ? e.message : String(e)}).`;
    registered = false;
  }
}
