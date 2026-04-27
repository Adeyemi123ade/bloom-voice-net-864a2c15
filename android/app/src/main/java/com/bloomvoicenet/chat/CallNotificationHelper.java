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
import java.util.Map;

public class CallNotificationHelper {
    static final String CHANNEL_ID = "incoming_calls_fullscreen";
    static final String ACTION_ACCEPT = "com.bloomvoicenet.chat.ACCEPT_CALL";
    static final String ACTION_DECLINE = "com.bloomvoicenet.chat.DECLINE_CALL";

    static int notificationId(String callId) {
        return Math.abs(callId == null ? 1001 : callId.hashCode());
    }

    static void showIncomingCall(Context context, Map<String, String> data) {
        createChannel(context);
        String callId = data.get("callId");
        int id = notificationId(callId);

        Intent fullScreen = new Intent(context, IncomingCallActivity.class);
        fullScreen.putExtras(Extras.from(data));
        fullScreen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent fullScreenPi = PendingIntent.getActivity(
            context, id, fullScreen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent acceptPi = PendingIntent.getBroadcast(
            context, id + 1, new Intent(context, CallActionReceiver.class).setAction(ACTION_ACCEPT).putExtras(Extras.from(data)),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent declinePi = PendingIntent.getBroadcast(
            context, id + 2, new Intent(context, CallActionReceiver.class).setAction(ACTION_DECLINE).putExtras(Extras.from(data)),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_call)
            .setContentTitle("Incoming " + ("video".equals(data.get("callType")) ? "video " : "") + "call")
            .setContentText((data.get("callerName") == null ? "Someone" : data.get("callerName")) + " is calling…")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
            .setVibrate(new long[] {0, 700, 350, 700, 1000})
            .setFullScreenIntent(fullScreenPi, true)
            .setContentIntent(fullScreenPi)
            .addAction(R.drawable.ic_stat_call, "Decline", declinePi)
            .addAction(R.drawable.ic_stat_call, "Accept", acceptPi)
            .build();

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(id, notification);
        wakeBriefly(context, callId);
        context.startActivity(fullScreen);
    }

    static void cancel(Context context, String callId) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(notificationId(callId));
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Full-screen incoming ChiChat calls");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.enableVibration(true);
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        AudioAttributes attrs = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build();
        ch.setSound(sound, attrs);
        nm.createNotificationChannel(ch);
    }

    private static void wakeBriefly(Context context, String callId) {
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            PowerManager.WakeLock wl = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "ChiChat:IncomingCall:" + callId
            );
            wl.acquire(12000);
        } catch (Exception ignored) {}
    }
}
