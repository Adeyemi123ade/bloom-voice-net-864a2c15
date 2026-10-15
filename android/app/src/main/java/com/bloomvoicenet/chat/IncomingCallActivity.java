package com.bloomvoicenet.chat;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import java.lang.ref.WeakReference;

public class IncomingCallActivity extends AppCompatActivity {
    private Intent callIntent;
    // The call screen currently showing, so a "call cancelled" push can close it.
    private static WeakReference<IncomingCallActivity> current = new WeakReference<>(null);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = () -> {
        CallNotificationHelper.cancel(this, callIntent.getStringExtra("callId"));
        finishAndRemoveTask();
    };

    /** Close the full-screen ringer for this call if it's showing. */
    static void dismiss(String callId) {
        IncomingCallActivity a = current.get();
        if (a == null || a.callIntent == null) return;
        String showing = a.callIntent.getStringExtra("callId");
        if (callId == null || callId.equals(showing)) {
            a.runOnUiThread(a::finishAndRemoveTask);
        }
    }

    private void armTimeout() {
        handler.removeCallbacks(timeout);
        handler.postDelayed(timeout, CallNotificationHelper.RING_TIMEOUT_MS);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(timeout);
        if (current.get() == this) current = new WeakReference<>(null);
        super.onDestroy();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        callIntent = getIntent();
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            ((KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE)).requestDismissKeyguard(this, null);
        } else {
            w.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        current = new WeakReference<>(this);
        armTimeout();
        render();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        callIntent = intent;
        setIntent(intent);
        current = new WeakReference<>(this);
        armTimeout();
        render();
    }

    private void render() {
        String caller = callIntent.getStringExtra("callerName");
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(48, 80, 48, 80);
        root.setBackgroundColor(Color.rgb(18, 18, 18));

        TextView title = new TextView(this);
        title.setText("Incoming " + ("video".equals(callIntent.getStringExtra("callType")) ? "video " : "") + "call");
        title.setTextColor(Color.WHITE);
        title.setTextSize(18);
        title.setGravity(Gravity.CENTER);

        TextView name = new TextView(this);
        name.setText(caller == null ? "Someone" : caller);
        name.setTextColor(Color.WHITE);
        name.setTextSize(30);
        name.setGravity(Gravity.CENTER);
        name.setPadding(0, 40, 0, 80);

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER);
        actions.setOrientation(LinearLayout.HORIZONTAL);

        Button decline = new Button(this);
        decline.setText("Decline");
        decline.setOnClickListener(v -> {
            CallActionReceiver.declineInBackground(callIntent);
            CallNotificationHelper.cancel(this, callIntent.getStringExtra("callId"));
            stopService(new Intent(this, CallForegroundService.class));
            finishAndRemoveTask();
        });

        Button accept = new Button(this);
        accept.setText("Accept");
        accept.setOnClickListener(v -> {
            CallNotificationHelper.cancel(this, callIntent.getStringExtra("callId"));
            openAcceptedCall(this, callIntent);
            finishAndRemoveTask();
        });

        actions.addView(decline, new LinearLayout.LayoutParams(0, 140, 1));
        LinearLayout.LayoutParams spacer = new LinearLayout.LayoutParams(32, 1);
        TextView gap = new TextView(this);
        actions.addView(gap, spacer);
        actions.addView(accept, new LinearLayout.LayoutParams(0, 140, 1));

        root.addView(title, new LinearLayout.LayoutParams(-1, -2));
        root.addView(name, new LinearLayout.LayoutParams(-1, -2));
        root.addView(actions, new LinearLayout.LayoutParams(-1, -2));
        setContentView(root);
    }

    static void openAcceptedCall(Context context, Intent src) {
        Intent i = new Intent(context, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("openCall", true);
        i.putExtra("conversationId", src.getStringExtra("conversationId"));
        i.putExtra("callId", src.getStringExtra("callId"));
        i.putExtra("roomName", src.getStringExtra("roomName"));
        i.putExtra("callType", src.getStringExtra("callType"));
        context.startActivity(i);
    }
}
