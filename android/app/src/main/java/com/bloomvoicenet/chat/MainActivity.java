package com.bloomvoicenet.chat;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

public class MainActivity extends BridgeActivity {


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FirebaseApp.initializeApp(this);
        registerPlugin(ChiChatCallsPlugin.class);
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

        String base = bridge.getServerUrl() != null
                ? bridge.getServerUrl()
                : bridge.getLocalUrl();

        WebView webView = bridge.getWebView();
        webView.post(() -> webView.loadUrl(base + route));
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