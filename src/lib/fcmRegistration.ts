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
    // Usually offline. If it never answers, the app was likely built
    // without android/app/google-services.json (shown in the log only).
    console.warn("[fcm] no registration answer within 15 s");
    lastProblem = "We couldn't connect this phone for calls. Check you're online, then tap Try again. If it still doesn't work, update ChiChat to the latest version.";
  }
  return pushReady;
}

const TOKEN_KEY = "chichat:fcm-token";

type IncomingCallListener = (callId: string) => void;
const incomingCallListeners = new Set<IncomingCallListener>();

/** Called with the call id whenever a call push reaches the running app. */
export function onIncomingCallPush(f: IncomingCallListener): () => void {
  incomingCallListeners.add(f);
  return () => {
    incomingCallListeners.delete(f);
  };
}

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
      lastProblem = "Notifications are off for ChiChat. Turn them on, then tap Try again.";
      registered = false;
      return;
    }

    PushNotifications.addListener("registration", async (token) => {
      try {
        // Saved with this sign-in, so calls stop ringing this phone once it
        // signs out. The token belongs to the phone: the server moves it
        // from any account that used this phone before (a plain upsert
        // couldn't, and that account's calls kept ringing here instead).
        let { error } = await supabase.rpc("register_push_token", {
          _token: token.value,
          _platform: Capacitor.getPlatform(),
        });
        // The database doesn't have register_push_token yet (its SQL file
        // not run): save the token the old way, so calls still ring here.
        if (error && (error.code === "PGRST202" || error.code === "42883")) {
          ({ error } = await supabase.from("device_push_tokens").upsert(
            {
              user_id: userId,
              fcm_token: token.value,
              platform: Capacitor.getPlatform(),
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "fcm_token" },
          ));
        }
        // Supabase reports failures in `error` rather than throwing.
        if (error) {
          console.warn("[fcm] failed to store token", error);
          lastProblem = "We couldn't connect this phone for calls. Check you're online, then tap Try again.";
        }
        else {
          pushReady = true;
          lastProblem = null;
          try { localStorage.setItem(TOKEN_KEY, token.value); } catch { /* ignore */ }
        }
      } catch (e) {
        console.warn("[fcm] failed to store token", e);
        lastProblem = "We couldn't connect this phone for calls. Check you're online, then tap Try again.";
      }
    });

    PushNotifications.addListener("registrationError", (e) => {
      console.warn("[fcm] registration error", e);
      lastProblem = "We couldn't connect this phone for calls. Check you're online, then tap Try again.";
    });

    // Incoming data-only call push → app foregrounds, IncomingCallScreen
    // takes over from the realtime subscription on the `calls` table.
    // A call push reaching the app while it runs (on screen or in the
    // background): hand it to the incoming call screen too. The realtime
    // listener can miss a call after the connection dropped and came back.
    PushNotifications.addListener("pushNotificationReceived", (n) => {
      const data = (n.data ?? {}) as Record<string, string>;
      if (data.type === "incoming_call" && data.callId) {
        incomingCallListeners.forEach((f) => {
          try { f(data.callId); } catch { /* ignore */ }
        });
      }
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
      console.log("[fcm] push tapped", a.notification.data);
    });

    await PushNotifications.register();
  } catch (e) {
    console.warn("[fcm] setup failed", e);
    lastProblem = "We couldn't connect this phone for calls. Check you're online, then tap Try again.";
    registered = false;
  }
}
