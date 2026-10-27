package com.bloomvoicenet.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import java.util.Map;

public class CallNotificationHelper {
    // Silent channel: CallRinger plays the tone chosen in ChiChat (the old
    // channel played the phone's own ringtone, and a channel's sound can't
    // be changed once created, so it's replaced).
    static final String CHANNEL_ID = "incoming_calls_v3";
    private static final String OLD_CHANNEL_ID = "incoming_calls_fullscreen_v2";
    static final String ACTION_ACCEPT = "com.bloomvoicenet.chat.ACCEPT_CALL";
    static final String ACTION_DECLINE = "com.bloomvoicenet.chat.DECLINE_CALL";
    static final String MISSED_CHANNEL_ID = "missed_calls";
    // Same as the app's CALL_RING_TIMEOUT_MS: an unanswered call stops ringing
    // after 45 s even if the "call cancelled" push never arrives.
    static final long RING_TIMEOUT_MS = 45_000L;

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
            .setTimeoutAfter(RING_TIMEOUT_MS)
            .setFullScreenIntent(fullScreenPi, true)
            .setContentIntent(fullScreenPi)
            // CallStyle is what Android 12+ uses to treat this as a real
            // ringing call (correct ranking, screen-wake, lock-screen UI).
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declinePi, acceptPi));

        Notification notification = builder.build();
        // Keep ringing (like a phone) until answered, declined, cancelled by
        // the caller, or the 45 s timeout above, instead of playing once.
        notification.flags |= Notification.FLAG_INSISTENT;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(id, notification);
        // The ringtone chosen in ChiChat (or ChiChat's default), until the
        // call is answered, declined, cancelled or times out.
        RingService.ring(context, id, notification);
        // A real call (not the Call setup test): the caller can now hear
        // ringing, because this phone really rings.
        if (!"1".equals(data.get("test"))) CallActionReceiver.reportRinging(data);
    }

    /**
     * The caller hung up, the call timed out, or it was answered or declined
     * on another device: stop ringing, close the full-screen call screen and,
     * for a call nobody answered, leave a "Missed call" notification.
     */
    static void callCancelled(Context context, Map<String, String> data) {
        String callId = data.get("callId");
        cancel(context, callId);
        IncomingCallActivity.dismiss(callId);
        String reason = data.get("reason");
        if ("missed".equals(reason) || "cancelled".equals(reason)) {
            showMissedCall(context, data);
        }
    }

    static void showMissedCall(Context context, Map<String, String> data) {
        createMissedChannel(context);
        String callerName = data.get("callerName") == null ? "Someone" : data.get("callerName");
        boolean isVideo = "video".equals(data.get("callType"));
        String conversationId = data.get("conversationId");
        Intent open = new Intent(context, MainActivity.class);
        if (conversationId != null && !conversationId.isEmpty()) open.putExtra("openChat", conversationId);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int id = notificationId(data.get("callId")) + 3;
        PendingIntent pi = PendingIntent.getActivity(
            context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, MISSED_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_call)
            .setContentTitle(isVideo ? "Missed video call" : "Missed voice call")
            .setContentText(callerName)
            .setCategory("missed_call")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pi);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(id, b.build());
    }

    static void createMissedChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(MISSED_CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            MISSED_CHANNEL_ID, "Missed calls", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("Calls you didn't answer");
        nm.createNotificationChannel(ch);
    }

    static void cancel(Context context, String callId) {
        RingService.silence(context);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(notificationId(callId));
    }

    static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(OLD_CHANNEL_ID) != null) nm.deleteNotificationChannel(OLD_CHANNEL_ID);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Full-screen incoming ChiChat calls");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] {0, 700, 350, 700, 1000, 700});
        ch.setBypassDnd(true);
        ch.setShowBadge(true);
        ch.setSound(null, null);
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
