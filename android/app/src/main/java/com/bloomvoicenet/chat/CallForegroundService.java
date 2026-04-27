package com.bloomvoicenet.chat;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

public class CallForegroundService extends Service {
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        CallNotificationHelper.createChannel(this);
        Notification n = new NotificationCompat.Builder(this, CallNotificationHelper.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_call)
            .setContentTitle("ChiChat call in progress")
            .setContentText("Keeping your call connected")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .build();
        startForeground(44, n);
        return START_STICKY;
    }
}
