package com.bloomvoicenet.chat;

/**
 * Whether ChiChat is on screen. When it is, the app's own screens handle an
 * incoming call or message (ringing, in-app banner), so the push handler
 * doesn't also post a system notification; when it isn't, the push handler
 * rings the phone or shows the notification.
 */
public final class AppState {
    private static volatile boolean foreground = false;

    private AppState() {}

    static void setForeground(boolean value) {
        foreground = value;
    }

    static boolean isForeground() {
        return foreground;
    }
}
