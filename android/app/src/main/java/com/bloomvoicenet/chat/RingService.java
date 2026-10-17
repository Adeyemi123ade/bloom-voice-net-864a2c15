package com.bloomvoicenet.chat;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.ServiceCompat;

/**
 * Keeps ChiChat running while an incoming call rings with the app closed, so
 * the ringtone (CallRinger) isn't cut off when the phone tidies up
 * background apps. It shows the incoming-call notification itself, no other.
 */
public class RingService extends Service {
    private static Notification pending;
    private static int pendingId;

    @Override public IBinder onBind(Intent intent) { return null; }

    /** Starts ringing for this call notification. */
    static void ring(Context context, int notificationId, Notification notification) {
        pending = notification;
        pendingId = notificationId;
        try {
            context.startForegroundService(new Intent(context, RingService.class));
        } catch (Throwable t) {
            // The phone refused a background service: ring anyway.
            CallRinger.start(context);
        }
    }

    static void silence(Context context) {
        CallRinger.stopPlayback();
        try {
            context.stopService(new Intent(context, RingService.class));
        } catch (Throwable ignored) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (pending != null) {
            try {
                int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                    : 0;
                ServiceCompat.startForeground(this, pendingId, pending, type);
            } catch (Throwable ignored) {
                // Still ring; the service just may not live as long.
            }
        }
        CallRinger.start(this);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        CallRinger.stopPlayback();
        super.onDestroy();
    }
}
