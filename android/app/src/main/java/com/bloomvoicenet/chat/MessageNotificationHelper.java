package com.bloomvoicenet.chat;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * "New message" notifications when ChiChat isn't on screen. One notification
 * per chat, listing that chat's recent messages; tapping opens the chat.
 * Cleared when the app is opened.
 */
public class MessageNotificationHelper {
    static final String CHANNEL_ID = "messages";
    private static final int MAX_LINES = 6;
    private static final Map<String, List<String[]>> pending = new HashMap<>();
    /** Message ids already shown, so a push delivered twice isn't counted twice. */
    private static final Set<String> shownIds = new HashSet<>();

    static int notificationId(String conversationId) {
        return Math.abs(("msg:" + conversationId).hashCode());
    }

    static synchronized void show(Context context, Map<String, String> data) {
        String conversationId = data.get("conversationId");
        if (conversationId == null || conversationId.isEmpty()) return;
        String sender = data.get("senderName") == null ? "ChiChat" : data.get("senderName");
        String preview = data.get("preview") == null ? "New message" : data.get("preview");
        String messageId = data.get("messageId");
        if (messageId != null && !messageId.isEmpty() && !shownIds.add(messageId)) return;
        if (shownIds.size() > 500) shownIds.clear();
        createChannel(context);

        List<String[]> lines = pending.get(conversationId);
        if (lines == null) {
            // The app process may have been stopped since the last message:
            // pick up what that chat's notification on the screen already holds.
            lines = restoreLines(context, conversationId);
            pending.put(conversationId, lines);
        }
        lines.add(new String[] {sender, preview});
        while (lines.size() > MAX_LINES) lines.remove(0);

        Person me = new Person.Builder().setName("You").build();
        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(me);
        long now = System.currentTimeMillis();
        for (String[] l : lines) {
            style.addMessage(l[1], now, new Person.Builder().setName(l[0]).build());
        }

        Intent open = new Intent(context, MainActivity.class);
        open.putExtra("openChat", conversationId);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int id = notificationId(conversationId);
        PendingIntent pi = PendingIntent.getActivity(
            context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_message)
            .setContentTitle(sender)
            .setContentText(preview)
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setNumber(lines.size())
            .setContentIntent(pi);

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(id, b.build());
    }

    private static List<String[]> restoreLines(Context context, String conversationId) {
        List<String[]> lines = new ArrayList<>();
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            int id = notificationId(conversationId);
            for (StatusBarNotification sbn : nm.getActiveNotifications()) {
                if (sbn.getId() != id) continue;
                NotificationCompat.MessagingStyle old =
                    NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(sbn.getNotification());
                if (old == null) break;
                for (NotificationCompat.MessagingStyle.Message m : old.getMessages()) {
                    String who = m.getPerson() == null || m.getPerson().getName() == null
                        ? "ChiChat" : m.getPerson().getName().toString();
                    lines.add(new String[] {who, String.valueOf(m.getText())});
                }
                break;
            }
        } catch (Throwable ignored) {
            // Starting again from this message is fine.
        }
        return lines;
    }

    /**
     * The user opened the app: their messages are in front of them now. Clears
     * every message notification on the screen, including ones posted before
     * the app process last restarted (which the in-memory list no longer knows).
     */
    static synchronized void clearAll(Context context) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        try {
            for (StatusBarNotification sbn : nm.getActiveNotifications()) {
                if (CHANNEL_ID.equals(sbn.getNotification().getChannelId())) nm.cancel(sbn.getId());
            }
        } catch (Throwable ignored) {
            // Fall back to the chats this process knows about.
        }
        for (String conversationId : pending.keySet()) nm.cancel(notificationId(conversationId));
        pending.clear();
        shownIds.clear();
    }

    static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "Messages", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("New ChiChat messages");
        ch.enableVibration(true);
        ch.setShowBadge(true);
        nm.createNotificationChannel(ch);
    }
}
