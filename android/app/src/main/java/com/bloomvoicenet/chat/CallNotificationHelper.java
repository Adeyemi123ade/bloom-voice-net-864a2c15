package com.bloomvoicenet.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.content.FileProvider;
import java.io.File;
import java.util.Map;

public class CallNotificationHelper {
    // The call notification rings by itself: Android plays the channel's
    // sound, looping (FLAG_INSISTENT) until the call is answered, declined,
    // cancelled or times out. Nothing else has to be running, so it rings
    // with the app closed, the phone locked, and battery saving on.
    // (Until 1.12 the channel was silent and a background service played the
    // tone; since 1.9 dropped the battery exemption, Android often refused
    // that service, so the call screen showed without a sound.)
    // A channel's sound can't change once created, so each tone has its own
    // channel: ChiChat's tone, or the one chosen in ChiChat.
    private static final String CHANNEL_PREFIX = "incoming_calls";
    private static final String DEFAULT_CHANNEL_ID = "incoming_calls_ring_v4";
    // A call alert that reaches the phone this late is for a call that is
    // over (the phone held it while asleep): it shows as missed instead of
    // ringing. Generous, so a phone clock that is a little off doesn't matter.
    static final long STALE_ALERT_MS = 60_000L;
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
        String callId = data.get("callId");
        // The caller's phone sends the call alert again if this phone hasn't
        // rung within a few seconds; when it is already ringing, the repeat
        // changes nothing (the ringtone doesn't restart).
        if (isRinging(context, notificationId(callId))) return;
        String channelId = ringChannel(context);
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

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
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

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // Phones before Android 8 take the sound from the notification.
            builder.setSound(defaultToneUri(context), android.media.AudioManager.STREAM_RING);
            builder.setVibrate(new long[] {0, 700, 350, 700, 1000, 700});
        }

        Notification notification = builder.build();
        // Keep ringing (like a phone) until answered, declined, cancelled by
        // the caller, or the 45 s timeout above, instead of playing once.
        notification.flags |= Notification.FLAG_INSISTENT;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(id, notification);
        // A real call (not the Call setup test): the caller can now hear
        // ringing, because this phone really rings. The server also answers
        // whether the call is still on; if it's already over, the ringing
        // stops and it shows as missed.
        if (!"1".equals(data.get("test"))) CallActionReceiver.reportRinging(context, data);
    }

    /** A call alert held back by the phone until the call was over: missed, not ringing. */
    static void showLateCall(Context context, Map<String, String> data) {
        showMissedCall(context, data);
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
        // Stops a ringtone from an older version's background ringer, if any.
        RingService.silence(context);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(notificationId(callId));
    }

    /**
     * ChiChat came on screen: it shows the incoming call and rings by itself,
     * so the ringing notification goes (no two ringtones at once).
     */
    static void stopRingingNotifications(Context context) {
        RingService.silence(context);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            for (StatusBarNotification n : nm.getActiveNotifications()) {
                String ch = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? n.getNotification().getChannelId() : null;
                boolean ringing = ch != null
                    ? ch.startsWith(CHANNEL_PREFIX)
                    : (n.getNotification().flags & Notification.FLAG_INSISTENT) != 0;
                if (ringing) nm.cancel(n.getTag(), n.getId());
            }
        } catch (Throwable ignored) {}
    }

    private static boolean isRinging(Context context, int id) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            for (StatusBarNotification n : nm.getActiveNotifications()) {
                if (n.getId() == id) return true;
            }
        } catch (Throwable ignored) {}
        return false;
    }

    private static Uri defaultToneUri(Context context) {
        return Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.chichat_ring);
    }

    /** The channel ringing with the tone chosen in ChiChat, or ChiChat's own tone. Created when needed. */
    static String ringChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return DEFAULT_CHANNEL_ID;
        File tone = CallRinger.savedTone(context);
        if (tone != null) {
            try {
                Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", tone);
                // The sound is played by Android itself, which must be able to read the file.
                for (String pkg : new String[] {"com.android.systemui", "android"}) {
                    context.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
                String id = CHANNEL_PREFIX + "_tone_" + Integer.toHexString(tone.getName().hashCode());
                ensureRingChannel(context, id, uri);
                return id;
            } catch (Throwable ignored) {
                // A tone Android can't use: ring with ChiChat's own.
            }
        }
        ensureRingChannel(context, DEFAULT_CHANNEL_ID, defaultToneUri(context));
        return DEFAULT_CHANNEL_ID;
    }

    private static void ensureRingChannel(Context context, String id, Uri sound) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        // Earlier call channels (silent ones, or for a tone no longer chosen) go.
        for (NotificationChannel old : nm.getNotificationChannels()) {
            String oid = old.getId();
            if (oid.startsWith(CHANNEL_PREFIX) && !oid.equals(id)) nm.deleteNotificationChannel(oid);
        }
        if (nm.getNotificationChannel(id) != null) return;
        NotificationChannel ch = new NotificationChannel(id, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Rings for incoming ChiChat calls");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] {0, 700, 350, 700, 1000, 700});
        ch.setBypassDnd(true);
        ch.setShowBadge(true);
        ch.setSound(sound, new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
        nm.createNotificationChannel(ch);
    }

    /** The current call channel, for the Call setup check. */
    static String currentChannelId(Context context) {
        return ringChannel(context);
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
