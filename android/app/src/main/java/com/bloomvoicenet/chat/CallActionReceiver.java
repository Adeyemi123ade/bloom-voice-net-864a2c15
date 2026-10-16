package com.bloomvoicenet.chat;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
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

    /**
     * Decline from the lock screen or the notification: tell the server, so
     * the caller's phone stops ringing at once. Tries twice; the request
     * carries Supabase's public key (actionKey), without which Supabase
     * refused it and the caller kept ringing.
     */
    static void declineInBackground(Intent intent) {
        final String actionUrl = intent.getStringExtra("actionUrl");
        if (actionUrl == null) return;
        final String key = intent.getStringExtra("actionKey");
        final String body = "{\"action\":\"decline\",\"callId\":\"" + esc(intent.getStringExtra("callId")) +
            "\",\"calleeId\":\"" + esc(intent.getStringExtra("calleeId")) +
            "\",\"token\":\"" + esc(intent.getStringExtra("actionToken")) + "\"}";
        new Thread(() -> {
            for (int attempt = 0; attempt < 2; attempt++) {
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(actionUrl).openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(8000);
                    c.setRequestMethod("POST");
                    c.setRequestProperty("Content-Type", "application/json");
                    if (key != null && !key.isEmpty()) {
                        c.setRequestProperty("apikey", key);
                        c.setRequestProperty("Authorization", "Bearer " + key);
                    }
                    c.setDoOutput(true);
                    try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes("UTF-8")); }
                    int code = c.getResponseCode();
                    c.disconnect();
                    Log.i("ChiChatCalls", "decline sent: " + code);
                    if (code >= 200 && code < 300) return;
                } catch (Exception e) {
                    Log.w("ChiChatCalls", "decline failed", e);
                }
                try { Thread.sleep(1500); } catch (InterruptedException ignored) { return; }
            }
        }).start();
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
