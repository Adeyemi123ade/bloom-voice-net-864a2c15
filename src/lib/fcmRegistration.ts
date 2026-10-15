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
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      console.warn("[fcm] push permission denied");
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
        if (error) console.warn("[fcm] failed to store token", error);
        else {
          pushReady = true;
          try { localStorage.setItem(TOKEN_KEY, token.value); } catch { /* ignore */ }
        }
      } catch (e) {
        console.warn("[fcm] failed to store token", e);
      }
    });

    PushNotifications.addListener("registrationError", (e) => {
      console.warn("[fcm] registration error", e);
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
    registered = false;
  }
}
