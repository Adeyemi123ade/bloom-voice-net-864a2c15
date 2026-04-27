package com.bloomvoicenet.chat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class ChiChatMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        if ("incoming_call".equals(remoteMessage.getData().get("type"))) {
            CallNotificationHelper.showIncomingCall(this, remoteMessage.getData());
        }
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(String token) {
        PushNotificationsPlugin.onNewToken(token);
    }
}
