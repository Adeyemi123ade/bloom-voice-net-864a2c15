package com.bloomvoicenet.chat;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ChiChatCallsPlugin.class);
        super.onCreate(savedInstanceState);
        openCallFromIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openCallFromIntent(intent);
    }

    private void openCallFromIntent(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("openCall", false) || bridge == null) return;
        String conversationId = intent.getStringExtra("conversationId");
        String callId = intent.getStringExtra("callId");
        String room = intent.getStringExtra("roomName");
        String type = intent.getStringExtra("callType");
        if (conversationId == null || callId == null || room == null) return;
        String route = "/call/" + enc(conversationId) + "?type=" + enc(type == null ? "voice" : type) + "&callId=" + enc(callId) + "&room=" + enc(room) + "&role=callee";
        String base = bridge.getServerUrl() != null ? bridge.getServerUrl() : bridge.getLocalUrl();
        WebView webView = bridge.getWebView();
        webView.post(() -> webView.loadUrl(base + route));
    }

    private static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
