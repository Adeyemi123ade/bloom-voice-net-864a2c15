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
        await supabase.from("device_push_tokens").upsert(
          {
            user_id: userId,
            fcm_token: token.value,
            platform: Capacitor.getPlatform(),
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "fcm_token" },
        );
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
