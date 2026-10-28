package com.bloomvoicenet.chat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class ChiChatMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        try {
            if ("incoming_call".equals(type)) {
                // Held back by the phone while it slept, and arriving after
                // the call could still be answered: show it as missed rather
                // than ringing for a call that is over.
                long sent = remoteMessage.getSentTime();
                long age = sent > 0 ? System.currentTimeMillis() - sent : 0;
                if (age > CallNotificationHelper.STALE_ALERT_MS) {
                    if (!AppState.isForeground()) CallNotificationHelper.showLateCall(this, data);
                } else if (!AppState.isForeground()) {
                    // On screen, the app rings itself; ringing here too would
                    // play two ringtones at once.
                    CallNotificationHelper.showIncomingCall(this, data);
                }
            } else if ("call_cancelled".equals(type)) {
                // Always stop any ringing; only leave a missed-call notice
                // when the app isn't open (in the app, the chat shows it).
                if (AppState.isForeground()) {
                    CallNotificationHelper.cancel(this, data.get("callId"));
                    IncomingCallActivity.dismiss(data.get("callId"));
                } else {
                    CallNotificationHelper.callCancelled(this, data);
                }
            } else if ("test_call".equals(type)) {
                // "Send test call" from the app's Call setup check: ring the
                // same way a real call would, even if ChiChat is open.
                CallNotificationHelper.showIncomingCall(this, data);
            } else if ("message".equals(type)) {
                if (!AppState.isForeground()) MessageNotificationHelper.show(this, data);
            }
        } catch (Throwable ignored) {
            // A bad payload must never crash the app's push service.
        }
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(String token) {
        PushNotificationsPlugin.onNewToken(token);
    }
}
