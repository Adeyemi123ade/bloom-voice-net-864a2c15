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
            // Keep this receiver (and the app) alive until the server has the
            // decline; otherwise the phone may cut the app off mid-request.
            final PendingResult pending = goAsync();
            decline(intent, ok -> {
                context.stopService(new Intent(context, CallForegroundService.class));
                pending.finish();
            });
        }
    }

    interface Done {
        void run(boolean ok);
    }

    /**
     * Decline from the lock screen or the notification: tell the server, so
     * the caller's phone stops ringing at once. Tries three times, carries
     * Supabase's public key (actionKey), and reports back when finished so
     * the caller of this method can keep the app alive until then.
     */
    static void decline(Intent intent, Done done) {
        final String actionUrl = intent.getStringExtra("actionUrl");
        if (actionUrl == null) {
            Log.w("ChiChatCalls", "decline: no actionUrl in the call push");
            done.run(false);
            return;
        }
        final String key = intent.getStringExtra("actionKey");
        final String body = "{\"action\":\"decline\",\"callId\":\"" + esc(intent.getStringExtra("callId")) +
            "\",\"calleeId\":\"" + esc(intent.getStringExtra("calleeId")) +
            "\",\"token\":\"" + esc(intent.getStringExtra("actionToken")) + "\"}";
        new Thread(() -> {
            boolean ok = false;
            for (int attempt = 0; attempt < 3 && !ok; attempt++) {
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(actionUrl).openConnection();
                    c.setConnectTimeout(4000);
                    c.setReadTimeout(4000);
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
                    ok = code >= 200 && code < 300;
                } catch (Exception e) {
                    Log.w("ChiChatCalls", "decline failed", e);
                }
                if (!ok && attempt < 2) {
                    try { Thread.sleep(1000); } catch (InterruptedException ignored) { break; }
                }
            }
            done.run(ok);
        }).start();
    }

    /**
     * This phone is now ringing for the call (its call screen is up): tell
     * the server, so the caller's screen moves from "Calling…" to
     * "Ringing…" and plays the ringing tone. Uses the signed ringingToken
     * from the call push, so no signed-in session is needed. One quick try
     * plus one retry; if both fail the caller just keeps "Calling…".
     */
    static void reportRinging(java.util.Map<String, String> data) {
        final String actionUrl = data.get("actionUrl");
        final String ringingToken = data.get("ringingToken");
        if (actionUrl == null || ringingToken == null || ringingToken.isEmpty()) return;
        final String key = data.get("actionKey");
        final String body = "{\"action\":\"ringing\",\"callId\":\"" + esc(data.get("callId")) +
            "\",\"calleeId\":\"" + esc(data.get("calleeId")) +
            "\",\"ringingToken\":\"" + esc(ringingToken) + "\"}";
        new Thread(() -> {
            for (int attempt = 0; attempt < 2; attempt++) {
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(actionUrl).openConnection();
                    c.setConnectTimeout(4000);
                    c.setReadTimeout(4000);
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
                    if (code >= 200 && code < 300) return;
                    if (code >= 400 && code < 500) return; // refused: don't retry
                } catch (Exception e) {
                    Log.w("ChiChatCalls", "ringing report failed", e);
                }
                try { Thread.sleep(1000); } catch (InterruptedException ignored) { return; }
            }
        }).start();
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
