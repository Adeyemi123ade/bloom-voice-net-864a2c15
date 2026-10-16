package com.bloomvoicenet.chat;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import android.graphics.Color;
import android.os.Bundle;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

public class MainActivity extends BridgeActivity {
    private static final int DEEP_GREEN = Color.rgb(14, 88, 62);        // hsl(var(--brand-deep)) as the browser renders it
    private static final int APP_BACKGROUND = Color.rgb(243, 247, 246); // --background

    /**
     * A call answered while the phone was locked shows on top of the lock
     * screen. Back then hides the app (back to the lock screen) instead of
     * opening chats, and when the call ends the lock screen comes back.
     */
    private boolean overLock = false;
    private final OnBackPressedCallback lockedBack = new OnBackPressedCallback(false) {
        @Override
        public void handleOnBackPressed() {
            moveTaskToBack(true);
        }
    };


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Must come BEFORE super.onCreate(): that's where Capacitor builds the
        // bridge with the registered plugins. Registered afterwards (as it
        // was), ChiChatCalls never loaded, so the full-screen-call permission
        // prompt, the battery prompt and the call foreground service never ran.
        registerPlugin(ChiChatCallsPlugin.class);
        super.onCreate(savedInstanceState);
        FirebaseApp.initializeApp(this);
        applySystemBarColors();
        getOnBackPressedDispatcher().addCallback(this, lockedBack);
        openCallFromIntent(getIntent());
        openChatFromIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openCallFromIntent(intent);
        openChatFromIntent(intent);
    }

    /**
     * Deep ChiChat green behind the phone's own navigation buttons, with
     * light buttons, instead of the default white strip.
     *
     * Up to Android 14 that's the navigation bar colour. On Android 15+ the
     * app is drawn edge to edge and the bar colour is ignored: Capacitor pads
     * the web view away from the bars, and those padded strips show the
     * background of the web view's parent. So that background is painted
     * too: the app's light background up top (behind the status bar, so the
     * top looks unchanged) and deep green along the bottom padding.
     */
    private void applySystemBarColors() {
        try {
            Window w = getWindow();
            w.setNavigationBarColor(DEEP_GREEN);
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            c.setAppearanceLightNavigationBars(false);
        } catch (Throwable ignored) {}
        try {
            if (bridge == null || bridge.getWebView() == null) return;
            final View parent = (View) bridge.getWebView().getParent();
            parent.setBackground(new Drawable() {
                private final Paint paint = new Paint();

                @Override
                public void draw(Canvas canvas) {
                    android.graphics.Rect b = getBounds();
                    canvas.drawColor(APP_BACKGROUND);
                    int bottom = parent.getPaddingBottom();
                    if (bottom > 0) {
                        paint.setColor(DEEP_GREEN);
                        canvas.drawRect(b.left, b.bottom - bottom, b.right, b.bottom, paint);
                    }
                }

                @Override
                public void setAlpha(int alpha) {}

                @Override
                public void setColorFilter(ColorFilter colorFilter) {}

                @Override
                public int getOpacity() {
                    return PixelFormat.OPAQUE;
                }
            });
            // Padding follows the keyboard and bars; repaint when it changes.
            parent.addOnLayoutChangeListener((v, l, t, r, bt, ol, ot, or, ob) -> v.invalidate());
        } catch (Throwable ignored) {}
    }

    @Override
    public void onResume() {
        super.onResume();
        AppState.setForeground(true);
        MessageNotificationHelper.clearAll(this);
    }

    @Override
    public void onPause() {
        AppState.setForeground(false);
        super.onPause();
    }

    /** Tapped a message or missed-call notification: open that chat. */
    private void openChatFromIntent(Intent intent) {
        if (intent == null || bridge == null) return;
        String conversationId = intent.getStringExtra("openChat");
        if (conversationId == null || conversationId.isEmpty()) return;
        intent.removeExtra("openChat");
        String base = bridge.getServerUrl() != null
                ? bridge.getServerUrl()
                : bridge.getLocalUrl();
        WebView webView = bridge.getWebView();
        webView.post(() -> webView.loadUrl(base + "/chat/" + enc(conversationId)));
    }

    private void openCallFromIntent(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("openCall", false) || bridge == null)
            return;
        // A test ring from the Call setup check has no real call to open.
        if ("1".equals(intent.getStringExtra("test"))) {
            intent.removeExtra("openCall");
            return;
        }

        String conversationId = intent.getStringExtra("conversationId");
        String callId = intent.getStringExtra("callId");
        String room = intent.getStringExtra("roomName");
        String type = intent.getStringExtra("callType");

        if (conversationId == null || callId == null || room == null)
            return;
        // Handled once: don't re-open the call if the activity is recreated.
        intent.removeExtra("openCall");

        String route = "/call/" + enc(conversationId)
                + "?type=" + enc(type == null ? "voice" : type)
                + "&callId=" + enc(callId)
                + "&room=" + enc(room)
                + "&role=callee";

        // Answered from the lock screen: show the call on top of it, no
        // unlock needed (the web app hides "minimise" for such a call).
        if (isPhoneLocked()) {
            showOverLockScreen(true);
            route += "&locked=1";
        }

        String base = bridge.getServerUrl() != null
                ? bridge.getServerUrl()
                : bridge.getLocalUrl();
        final String target = route;

        // If the app is already running, move to the call inside it (fast)
        // instead of reloading the whole app; reload only if that fails.
        WebView webView = bridge.getWebView();
        webView.post(() -> webView.evaluateJavascript(
                "(function(){if(window.__chichatNavigate){window.__chichatNavigate('"
                        + target.replace("'", "%27") + "');return 'ok';}return 'no';})()",
                result -> {
                    if (result == null || !result.contains("ok")) webView.loadUrl(base + target);
                }));
    }

    private boolean isPhoneLocked() {
        KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        return km != null && km.isKeyguardLocked();
    }

    private void showOverLockScreen(boolean on) {
        overLock = on;
        lockedBack.setEnabled(on);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(on);
                setTurnScreenOn(on);
            } else {
                int flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                        | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
                if (on) getWindow().addFlags(flags);
                else getWindow().clearFlags(flags);
            }
        } catch (Throwable ignored) {}
    }

    /** The call ended (foreground service stopped): give the lock screen back. */
    void releaseLockScreen() {
        if (overLock) showOverLockScreen(false);
    }

    private static String enc(String value) {
        if (value == null) return "";

        try {
            return URLEncoder.encode(value, "UTF-8")
                    .replace("+", "%20");
        } catch (UnsupportedEncodingException e) {
            // This should never happen for UTF-8
            throw new RuntimeException(e);
        }
    }
}