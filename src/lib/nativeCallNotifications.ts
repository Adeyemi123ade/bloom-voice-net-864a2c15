import { tNow } from "@/lib/i18n/language";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "@/integrations/supabase/client";
import { isCallPushReady } from "@/lib/fcmRegistration";

/**
 * Native heads-up incoming-call notifications for Android (Capacitor).
 *
 * On the web this is a no-op — the existing IncomingCallScreen handles UI ringing.
 * On native (Android), we listen for `calls` INSERTs targeted at the current user
 * and immediately fire a high-importance LocalNotification with sound +
 * vibration. Android pops a heads-up banner (and rings the phone with the
 * configured sound) even when the screen is off or the app is backgrounded.
 *
 * Limits: a true full-screen WhatsApp-style ringer requires a CallKit /
 * ConnectionService plugin (planned next milestone). Heads-up + sound is the
 * best Capacitor stock plugins can do without writing native code.
 */

let started = false;

export async function startNativeCallNotifications(userId: string) {
  if (started) return;
  if (!Capacitor.isNativePlatform()) return;
  started = true;

  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") {
      console.warn("[native-call] notification permission denied");
      return;
    }

    // High-importance channel = heads-up banner + sound + vibration even
    // when screen is locked.
    await LocalNotifications.createChannel({
      id: "incoming_calls",
      name: tNow("nn.channel"),
      description: tNow("nn.channelDesc"),
      importance: 5, // IMPORTANCE_HIGH
      visibility: 1,
      sound: "ringtone.wav",
      vibration: true,
      lights: true,
      lightColor: "#0B8F6C",
    });
  } catch (e) {
    console.warn("[native-call] channel setup failed", e);
  }

  // Tap on notification → focus app (the in-app IncomingCallScreen takes over).
  LocalNotifications.addListener("localNotificationActionPerformed", () => {
    /* App becomes foreground automatically; UI handles accept/decline. */
  });

  supabase
    .channel(`native-incoming-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "calls",
        filter: `callee_id=eq.${userId}`,
      },
      async (payload) => {
        const row = payload.new as {
          id: string;
          status: string;
          caller_id: string;
          call_type: string;
        };
        if (row?.status !== "ringing") return;
        // Fallback only. With push working, the phone's own full-screen
        // ringer handles a call when the app is in the background, and the
        // in-app call screen handles it when the app is open; ringing here
        // as well played two ringtones at once.
        if (isCallPushReady() || document.visibilityState === "visible") return;

        let callerName = "Someone";
        try {
          const { data } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", row.caller_id)
            .maybeSingle();
          if (data?.display_name) callerName = data.display_name;
        } catch {
          /* ignore */
        }

        try {
          await LocalNotifications.schedule({
            notifications: [
              {
                id: hashId(row.id),
                title: row.call_type === "video" ? tNow("nn.incomingVideo") : tNow("nn.incomingVoice"),
                body: tNow("nn.isCalling", { name: callerName }),
                channelId: "incoming_calls",
                ongoing: true,
                autoCancel: false,
                smallIcon: "ic_stat_icon_config_sample",
                largeIcon: "ic_launcher",
                extra: { callId: row.id },
              },
            ],
          });
        } catch (e) {
          console.warn("[native-call] schedule failed", e);
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "calls",
        filter: `callee_id=eq.${userId}`,
      },
      async (payload) => {
        const row = payload.new as { id: string; status: string };
        if (row.status === "ringing") return;
        try {
          await LocalNotifications.cancel({
            notifications: [{ id: hashId(row.id) }],
          });
        } catch {
          /* ignore */
        }
      },
    )
    .subscribe();
}

/** LocalNotifications wants a 32-bit int id; derive one from the call uuid. */
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
