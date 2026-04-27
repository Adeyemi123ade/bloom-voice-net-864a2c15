package com.bloomvoicenet.chat;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String callId = intent.getStringExtra("callId");
        CallNotificationHelper.cancel(context, callId);
        if (CallNotificationHelper.ACTION_ACCEPT.equals(action)) {
            IncomingCallActivity.openAcceptedCall(context, intent);
        } else if (CallNotificationHelper.ACTION_DECLINE.equals(action)) {
            declineInBackground(intent);
            context.stopService(new Intent(context, CallForegroundService.class));
        }
    }

    static void declineInBackground(Intent intent) {
        new Thread(() -> {
            try {
                String actionUrl = intent.getStringExtra("actionUrl");
                if (actionUrl == null) return;
                String body = "{\"action\":\"decline\",\"callId\":\"" + esc(intent.getStringExtra("callId")) +
                    "\",\"calleeId\":\"" + esc(intent.getStringExtra("calleeId")) +
                    "\",\"token\":\"" + esc(intent.getStringExtra("actionToken")) + "\"}";
                HttpURLConnection c = (HttpURLConnection) new URL(actionUrl).openConnection();
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setDoOutput(true);
                try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes()); }
                c.getResponseCode();
                c.disconnect();
            } catch (Exception ignored) {}
        }).start();
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
