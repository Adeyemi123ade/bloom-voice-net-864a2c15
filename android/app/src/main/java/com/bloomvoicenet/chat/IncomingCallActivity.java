package com.bloomvoicenet.chat;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.Toast;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.drawable.RoundedBitmapDrawable;
import androidx.core.graphics.drawable.RoundedBitmapDrawableFactory;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

/**
 * Full-screen incoming-call screen, shown by the call notification's
 * full-screen intent when the phone is locked or the screen is off (and
 * when ChiChat isn't open). Styled like the app's own incoming-call screen:
 * caller photo or initials in the upper part with the same pulsing rings,
 * Decline and Accept at the bottom.
 */
public class IncomingCallActivity extends AppCompatActivity {
    // ChiChat colours (match the web theme).
    private static final int GREEN = Color.rgb(15, 127, 92);       // #0F7F5C
    private static final int AVATAR_BG = Color.rgb(197, 222, 213);  // light green
    private static final int TEXT = Color.rgb(23, 33, 29);
    private static final int MUTED = Color.rgb(103, 117, 111);
    private static final int RED = Color.rgb(211, 84, 66);

    private Intent callIntent;
    // Set once Accept or Decline is tapped, so repeat taps do nothing.
    private boolean handled = false;
    // The call screen currently showing, so a "call cancelled" push can close it.
    private static WeakReference<IncomingCallActivity> current = new WeakReference<>(null);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<AnimatorSet> ringAnimations = new ArrayList<>();
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

    private boolean isTest() {
        return "1".equals(callIntent.getStringExtra("test"));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        callIntent = getIntent();
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            // Keep the lock: answering opens the app, which asks to unlock.
            // Only dismiss the keyguard when the phone has no secure lock.
            if (km != null && !km.isKeyguardSecure()) km.requestDismissKeyguard(this, null);
        } else {
            w.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            w.setStatusBarColor(Color.rgb(232, 243, 238));
            w.setNavigationBarColor(GREEN);
        }
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

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(timeout);
        stopRings();
        if (current.get() == this) current = new WeakReference<>(null);
        super.onDestroy();
    }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private static String initials(String name) {
        if (name == null || name.trim().isEmpty()) return "?";
        String[] parts = name.trim().split("\\s+");
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < parts.length && b.length() < 2; i++) {
            if (!parts[i].isEmpty()) b.append(Character.toUpperCase(parts[i].charAt(0)));
        }
        return b.toString();
    }

    private View ring(int size) {
        View v = new View(this);
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setStroke(dp(2), Color.argb(115, 15, 127, 92));
        d.setColor(Color.TRANSPARENT);
        v.setBackground(d);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(size, size, Gravity.CENTER);
        v.setLayoutParams(lp);
        return v;
    }

    /** Same motion as the app: rings grow from 0.9x to 1.35x and fade, 1.8 s, staggered. */
    private void startRing(View v, long delay) {
        ObjectAnimator sx = ObjectAnimator.ofFloat(v, "scaleX", 0.9f, 1.35f);
        ObjectAnimator sy = ObjectAnimator.ofFloat(v, "scaleY", 0.9f, 1.35f);
        ObjectAnimator a = ObjectAnimator.ofFloat(v, "alpha", 1f, 0f);
        for (ObjectAnimator o : new ObjectAnimator[] {sx, sy, a}) {
            o.setRepeatCount(ValueAnimator.INFINITE);
            o.setRepeatMode(ValueAnimator.RESTART);
        }
        AnimatorSet set = new AnimatorSet();
        set.playTogether(sx, sy, a);
        set.setDuration(1800);
        set.setStartDelay(delay);
        set.start();
        ringAnimations.add(set);
    }

    private void stopRings() {
        for (AnimatorSet s : ringAnimations) s.cancel();
        ringAnimations.clear();
    }

    private LinearLayout roundButton(String label, int color, boolean rotate, View.OnClickListener onClick) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);

        FrameLayout circle = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(color);
        circle.setBackground(bg);
        circle.setElevation(dp(6));
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.ic_stat_call);
        icon.setColorFilter(Color.WHITE);
        if (rotate) icon.setRotation(135f);
        circle.addView(icon, new FrameLayout.LayoutParams(dp(32), dp(32), Gravity.CENTER));
        circle.setOnClickListener(onClick);
        circle.setContentDescription(label);
        col.addView(circle, new LinearLayout.LayoutParams(dp(72), dp(72)));

        TextView t = new TextView(this);
        t.setText(label);
        t.setTextColor(TEXT);
        t.setTextSize(15);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(10), 0, 0);
        col.addView(t, new LinearLayout.LayoutParams(-2, -2));
        return col;
    }

    private void render() {
        stopRings();
        String caller = callIntent.getStringExtra("callerName");
        if (caller == null || caller.isEmpty()) caller = "Someone";
        boolean isVideo = "video".equals(callIntent.getStringExtra("callType"));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[] {Color.rgb(232, 243, 238), Color.rgb(244, 247, 245)});
        root.setBackground(bg);
        root.setPadding(dp(24), dp(72), dp(24), dp(56));

        TextView label = new TextView(this);
        label.setText(isVideo ? "INCOMING VIDEO CALL" : "INCOMING VOICE CALL");
        label.setTextColor(MUTED);
        label.setTextSize(13);
        label.setLetterSpacing(0.12f);
        label.setGravity(Gravity.CENTER);
        root.addView(label, new LinearLayout.LayoutParams(-1, -2));

        // Avatar with the pulsing rings, in the upper part of the screen.
        int avatarSize = dp(132);
        int boxSize = dp(220);
        FrameLayout avatarBox = new FrameLayout(this);
        View r1 = ring(avatarSize + dp(24));
        View r2 = ring(avatarSize + dp(24));
        avatarBox.addView(r1);
        avatarBox.addView(r2);

        FrameLayout avatar = new FrameLayout(this);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(AVATAR_BG);
        circle.setStroke(dp(4), Color.argb(90, 15, 127, 92));
        avatar.setBackground(circle);
        TextView letters = new TextView(this);
        letters.setText(initials(caller));
        letters.setTextColor(TEXT);
        letters.setTextSize(40);
        letters.setTypeface(Typeface.DEFAULT_BOLD);
        letters.setGravity(Gravity.CENTER);
        avatar.addView(letters, new FrameLayout.LayoutParams(-1, -1));
        ImageView photo = new ImageView(this);
        photo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        photo.setVisibility(View.GONE);
        avatar.addView(photo, new FrameLayout.LayoutParams(-1, -1));
        avatarBox.addView(avatar, new FrameLayout.LayoutParams(avatarSize, avatarSize, Gravity.CENTER));

        LinearLayout.LayoutParams boxLp = new LinearLayout.LayoutParams(boxSize, boxSize);
        boxLp.topMargin = dp(12);
        root.addView(avatarBox, boxLp);
        startRing(r1, 0);
        startRing(r2, 900);
        loadPhoto(callIntent.getStringExtra("avatarUrl"), photo);

        TextView name = new TextView(this);
        name.setText(caller);
        name.setTextColor(TEXT);
        name.setTextSize(28);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setGravity(Gravity.CENTER);
        root.addView(name, new LinearLayout.LayoutParams(-1, -2));

        TextView status = new TextView(this);
        status.setText("Ringing…");
        status.setTextColor(MUTED);
        status.setTextSize(16);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, dp(8), 0, 0);
        root.addView(status, new LinearLayout.LayoutParams(-1, -2));

        View spacer = new View(this);
        root.addView(spacer, new LinearLayout.LayoutParams(-1, 0, 1f));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);

        LinearLayout decline = roundButton("Decline", RED, true, v -> {
            if (handled) return;
            handled = true;
            v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
            // Stop ringing here at once.
            CallNotificationHelper.cancel(this, callIntent.getStringExtra("callId"));
            if (isTest()) {
                stopService(new Intent(this, CallForegroundService.class));
                finishAndRemoveTask();
                return;
            }
            // Stay on screen until the server has the decline: closing first
            // let the phone (Xiaomi especially) cut the app off before the
            // request went out, so the caller kept ringing.
            v.setAlpha(0.5f);
            CallActionReceiver.decline(callIntent, ok -> runOnUiThread(() -> {
                if (!ok) {
                    Toast.makeText(this, "Couldn't decline the call. Check your internet connection.",
                            Toast.LENGTH_LONG).show();
                }
                stopService(new Intent(this, CallForegroundService.class));
                finishAndRemoveTask();
            }));
        });
        LinearLayout accept = roundButton("Accept", GREEN, false, v -> {
            if (handled) return;
            handled = true;
            v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
            CallNotificationHelper.cancel(this, callIntent.getStringExtra("callId"));
            if (isTest()) {
                finishAndRemoveTask();
                return;
            }
            acceptAfterUnlock();
        });
        actions.addView(decline, new LinearLayout.LayoutParams(0, -2, 1f));
        actions.addView(accept, new LinearLayout.LayoutParams(0, -2, 1f));
        root.addView(actions, new LinearLayout.LayoutParams(-1, -2));

        setContentView(root);
    }

    /**
     * Answer at once, even with the phone locked: the call opens in the app
     * on top of the lock screen (like WhatsApp), with no unlock needed. It
     * used to ask for an unlock first and only answered after it; on some
     * phones (Xiaomi) that unlock request never showed, so Accept seemed to
     * do nothing and the caller kept ringing.
     */
    private void acceptAfterUnlock() {
        KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        boolean locked = km != null && km.isKeyguardLocked();
        Intent open = new Intent(callIntent);
        open.putExtra("overLock", locked);
        openAcceptedCall(this, open);
        finishAndRemoveTask();
    }

    /** Caller's profile photo, if they have one; the initials stay otherwise. */
    private void loadPhoto(String url, ImageView into) {
        if (url == null || url.isEmpty() || !url.startsWith("https://")) return;
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(5000);
                Bitmap bmp;
                try (InputStream in = c.getInputStream()) {
                    bmp = BitmapFactory.decodeStream(in);
                }
                c.disconnect();
                if (bmp == null) return;
                RoundedBitmapDrawable rd = RoundedBitmapDrawableFactory.create(getResources(), bmp);
                rd.setCircular(true);
                runOnUiThread(() -> {
                    if (isFinishing()) return;
                    into.setImageDrawable(rd);
                    into.setVisibility(View.VISIBLE);
                });
            } catch (Throwable ignored) {
                // Keep the initials.
            }
        }).start();
    }

    static void openAcceptedCall(Context context, Intent src) {
        Intent i = new Intent(context, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra("openCall", true);
        i.putExtra("conversationId", src.getStringExtra("conversationId"));
        i.putExtra("callId", src.getStringExtra("callId"));
        i.putExtra("roomName", src.getStringExtra("roomName"));
        i.putExtra("callType", src.getStringExtra("callType"));
        i.putExtra("overLock", src.getBooleanExtra("overLock", false));
        context.startActivity(i);
    }
}
