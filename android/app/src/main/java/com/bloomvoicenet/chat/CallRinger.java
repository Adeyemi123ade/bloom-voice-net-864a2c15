package com.bloomvoicenet.chat;

import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.io.File;

/**
 * Plays the ringtone chosen in ChiChat while a call rings with the app closed
 * or the phone locked. The web app sends its chosen tone here
 * (ChiChatCallsPlugin.ringtone*); with none sent yet, ChiChat's own default
 * tone (res/raw/chichat_ring) plays, so people always know it's ChiChat.
 * Silent and vibrate modes are respected: then the phone only vibrates.
 */
final class CallRinger {
    private static final String TAG = "ChiChatRinger";
    static final String PREFS = "chichat_ringtone";
    static final String KEY_PATH = "path";

    private static MediaPlayer player;
    private static Ringtone fallback;
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static Context appContext;
    // Unanswered after 45 s: stop the tone and the service keeping it alive.
    private static final Runnable timeout = () -> {
        if (appContext != null) RingService.silence(appContext);
        else stopPlayback();
    };

    private CallRinger() {}

    /** The saved tone file, or null for ChiChat's default. */
    static File savedTone(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String path = p.getString(KEY_PATH, null);
        if (path == null) return null;
        File f = new File(path);
        return f.isFile() && f.length() > 0 ? f : null;
    }

    static synchronized void start(Context context) {
        stopPlayback();
        appContext = context.getApplicationContext();
        AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (am != null && am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) return;

        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        try {
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(attrs);
            File tone = savedTone(context);
            if (tone != null) {
                mp.setDataSource(tone.getAbsolutePath());
            } else {
                mp.setDataSource(context, Uri.parse(
                    "android.resource://" + context.getPackageName() + "/" + R.raw.chichat_ring));
            }
            mp.setLooping(true);
            mp.setOnErrorListener((m, what, extra) -> {
                Log.w(TAG, "tone failed to play: " + what + "/" + extra);
                playSystemTone(context, attrs);
                return true;
            });
            mp.prepare();
            mp.start();
            player = mp;
        } catch (Throwable t) {
            // A file the phone can't play: ring with the phone's own tone
            // rather than not at all.
            Log.w(TAG, "tone could not start", t);
            playSystemTone(context, attrs);
        }
        handler.postDelayed(timeout, CallNotificationHelper.RING_TIMEOUT_MS);
    }

    private static synchronized void playSystemTone(Context context, AudioAttributes attrs) {
        releasePlayer();
        try {
            Ringtone r = RingtoneManager.getRingtone(context,
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE));
            if (r == null) return;
            r.setAudioAttributes(attrs);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) r.setLooping(true);
            r.play();
            fallback = r;
        } catch (Throwable ignored) {}
    }

    private static void releasePlayer() {
        if (player != null) {
            try { player.stop(); } catch (Throwable ignored) {}
            try { player.release(); } catch (Throwable ignored) {}
            player = null;
        }
    }

    static synchronized void stopPlayback() {
        handler.removeCallbacks(timeout);
        releasePlayer();
        if (fallback != null) {
            try { fallback.stop(); } catch (Throwable ignored) {}
            fallback = null;
        }
    }
}
