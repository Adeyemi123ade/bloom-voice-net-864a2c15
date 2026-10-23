package com.bloomvoicenet.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.pm.ServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Foreground service that keeps the call alive AND — critically — switches
 * the Android audio session into MODE_IN_COMMUNICATION so the WebView's
 * WebRTC streams actually route through the voice path. Without this, both
 * ends hear absolute silence even though the call is "connected".
 */
public class CallForegroundService extends Service {
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private int previousMode = AudioManager.MODE_NORMAL;
    private boolean previousSpeakerOn = false;
    private boolean audioConfigured = false;

    @Override public IBinder onBind(Intent intent) { return null; }

    // Quiet channel for the "call in progress" notification. It used to share
    // the incoming-call channel, whose ringtone sound played as the call began.
    static final String ONGOING_CHANNEL_ID = "ongoing_call";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createOngoingChannel();
        Notification n = new NotificationCompat.Builder(this, ONGOING_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_call)
            .setContentTitle("ChiChat call in progress")
            .setContentText("Keeping your call connected")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .build();
        try {
            // Android 14+ only allows a microphone foreground service while the
            // app is in use and has the mic permission; otherwise it throws,
            // which used to crash the whole app. Fail quietly instead.
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                : 0;
            ServiceCompat.startForeground(this, 44, n, type);
        } catch (Throwable t) {
            stopSelf();
            return START_NOT_STICKY;
        }
        configureAudioForCall();
        // Not sticky: if Android kills the app, don't restart a microphone
        // service in the background with no call (that's not allowed and crashed).
        return START_NOT_STICKY;
    }

    private void createOngoingChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(ONGOING_CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            ONGOING_CHANNEL_ID, "Ongoing calls", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Shown while a ChiChat call is in progress");
        ch.setSound(null, null);
        ch.enableVibration(false);
        nm.createNotificationChannel(ch);
    }

    private void configureAudioForCall() {
        if (audioConfigured) return;
        try {
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) return;

            previousMode = audioManager.getMode();
            previousSpeakerOn = audioManager.isSpeakerphoneOn();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attrs)
                    .setAcceptsDelayedFocusGain(false)
                    .build();
                audioManager.requestAudioFocus(focusRequest);
            } else {
                audioManager.requestAudioFocus(null,
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            }

            // THE fix: voice-call audio path. WebRTC mics + remote audio
            // only route correctly when the system is in this mode.
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            // Default to earpiece (like a regular phone call). The JS
            // speakerphone toggle can flip this later via the plugin.
            audioManager.setSpeakerphoneOn(false);
            audioConfigured = true;
        } catch (Throwable ignored) {}
    }

    private void restoreAudio() {
        if (!audioConfigured || audioManager == null) return;
        try {
            // Loudspeaker/headset choice made during the call goes with it.
            CallAudioRoute.reset(this);
            audioManager.setMode(previousMode);
            audioManager.setSpeakerphoneOn(previousSpeakerOn);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                audioManager.abandonAudioFocusRequest(focusRequest);
            } else {
                audioManager.abandonAudioFocus(null);
            }
        } catch (Throwable ignored) {}
        audioConfigured = false;
    }

    @Override
    public void onDestroy() {
        restoreAudio();
        super.onDestroy();
    }
}
