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
                // On screen, the app rings itself; ringing here too would
                // play two ringtones at once.
                if (!AppState.isForeground()) CallNotificationHelper.showIncomingCall(this, data);
            } else if ("call_cancelled".equals(type)) {
                // Always stop any ringing; only leave a missed-call notice
                // when the app isn't open (in the app, the chat shows it).
                if (AppState.isForeground()) {
                    CallNotificationHelper.cancel(this, data.get("callId"));
                    IncomingCallActivity.dismiss(data.get("callId"));
                } else {
                    CallNotificationHelper.callCancelled(this, data);
                }
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
