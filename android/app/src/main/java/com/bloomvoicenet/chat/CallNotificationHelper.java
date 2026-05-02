package com.bloomvoicenet.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import java.util.Map;

public class CallNotificationHelper {
    static final String CHANNEL_ID = "incoming_calls_fullscreen_v2";
    static final String ACTION_ACCEPT = "com.bloomvoicenet.chat.ACCEPT_CALL";
    static final String ACTION_DECLINE = "com.bloomvoicenet.chat.DECLINE_CALL";

    static int notificationId(String callId) {
        return Math.abs(callId == null ? 1001 : callId.hashCode());
    }

    static void showIncomingCall(Context context, Map<String, String> data) {
        createChannel(context);
        String callId = data.get("callId");
        String callerName = data.get("callerName") == null ? "Someone" : data.get("callerName");
        boolean isVideo = "video".equals(data.get("callType"));
        int id = notificationId(callId);

        // Wake the screen FIRST so the full-screen activity has something to draw onto.
        wakeBriefly(context, callId);

        // Full-screen intent → opens our lock-screen-aware IncomingCallActivity.
        Intent fullScreen = new Intent(context, IncomingCallActivity.class);
        fullScreen.putExtras(Extras.from(data));
        fullScreen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent fullScreenPi = PendingIntent.getActivity(
            context, id, fullScreen,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Accept → open MainActivity into the call route.
        Intent accept = new Intent(context, MainActivity.class);
        accept.putExtras(Extras.from(data));
        accept.putExtra("openCall", true);
        accept.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent acceptPi = PendingIntent.getActivity(
            context, id + 1, accept,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Decline → broadcast that POSTs decline to the edge function.
        PendingIntent declinePi = PendingIntent.getBroadcast(
            context, id + 2,
            new Intent(context, CallActionReceiver.class)
                .setAction(ACTION_DECLINE)
                .putExtras(Extras.from(data)),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Person caller = new Person.Builder()
            .setName(callerName)
            .setImportant(true)
            .build();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_call)
            .setContentTitle("Incoming " + (isVideo ? "video " : "") + "call")
            .setContentText(callerName + " is calling…")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(fullScreenPi, true)
            .setContentIntent(fullScreenPi)
            // CallStyle is what Android 12+ uses to treat this as a real
            // ringing call (correct ranking, screen-wake, lock-screen UI).
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePi, acceptPi));

        // On older Android (< 8) sound/vibration come from the notification itself.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
                .setVibrate(new long[] {0, 700, 350, 700, 1000, 700});
        }

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(id, builder.build());
    }

    static void cancel(Context context, String callId) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(notificationId(callId));
    }

    static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Full-screen incoming ChiChat calls");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] {0, 700, 350, 700, 1000, 700});
        ch.setBypassDnd(true);
        ch.setShowBadge(true);
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        ch.setSound(sound, attrs);
        nm.createNotificationChannel(ch);
    }

    private static void wakeBriefly(Context context, String callId) {
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            @SuppressWarnings("deprecation")
            PowerManager.WakeLock wl = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK
                    | PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                    | PowerManager.ACQUIRE_CAUSES_WAKEUP
                    | PowerManager.ON_AFTER_RELEASE,
                "ChiChat:IncomingCall:" + callId
            );
            wl.acquire(30_000);
        } catch (Exception ignored) {}
    }
}
