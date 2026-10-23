package com.bloomvoicenet.chat;

import android.content.Context;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;

import java.util.List;

/**
 * Where call audio plays: loudspeaker, earpiece, wired headset or Bluetooth.
 *
 * CallForegroundService puts Android in call mode (MODE_IN_COMMUNICATION) on
 * the earpiece. This class switches between loudspeaker and the "private"
 * route (Bluetooth headset if connected, else wired headset, else earpiece),
 * reports what is actually in use, and tells the app when a headset or
 * Bluetooth device comes or goes during a call.
 *
 * Android 12+ (API 31) uses setCommunicationDevice; older versions use
 * setSpeakerphoneOn (wired headsets then take over by themselves).
 */
final class CallAudioRoute {

    interface Listener {
        void onChange(JSObject state);
    }

    private CallAudioRoute() {}

    private static AudioManager audio(Context ctx) {
        return (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
    }

    private static boolean isWired(int type) {
        return type == AudioDeviceInfo.TYPE_WIRED_HEADSET
            || type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
            || type == AudioDeviceInfo.TYPE_USB_HEADSET;
    }

    private static boolean isBluetooth(int type) {
        if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) return true;
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && type == AudioDeviceInfo.TYPE_BLE_HEADSET;
    }

    private static boolean has(AudioManager am, boolean bluetooth) {
        if (am == null) return false;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            if (bluetooth ? isBluetooth(d.getType()) : isWired(d.getType())) return true;
        }
        return false;
    }

    static boolean isSpeakerOn(AudioManager am) {
        if (am == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo d = am.getCommunicationDevice();
            return d != null && d.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER;
        }
        return am.isSpeakerphoneOn();
    }

    /** What is in use now: { speaker, headset, bluetooth, inCall }. */
    static JSObject state(Context ctx) {
        AudioManager am = audio(ctx);
        JSObject o = new JSObject();
        o.put("speaker", isSpeakerOn(am));
        o.put("headset", has(am, false));
        o.put("bluetooth", has(am, true));
        o.put("inCall", am != null && am.getMode() == AudioManager.MODE_IN_COMMUNICATION);
        return o;
    }

    private static AudioDeviceInfo find(List<AudioDeviceInfo> devices, int... types) {
        for (int type : types) {
            for (AudioDeviceInfo d : devices) {
                if (d.getType() == type) return d;
            }
        }
        return null;
    }

    /** Loudspeaker on, or back to the private route (headset or earpiece). */
    static void setSpeaker(Context ctx, boolean on) {
        AudioManager am = audio(ctx);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            List<AudioDeviceInfo> devices = am.getAvailableCommunicationDevices();
            AudioDeviceInfo target = on
                ? find(devices, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
                : find(devices,
                    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                    AudioDeviceInfo.TYPE_BLE_HEADSET,
                    AudioDeviceInfo.TYPE_WIRED_HEADSET,
                    AudioDeviceInfo.TYPE_USB_HEADSET,
                    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE);
            boolean done = false;
            if (target != null) {
                try {
                    done = am.setCommunicationDevice(target);
                } catch (Throwable ignored) {}
            }
            if (!done) {
                if (on) am.setSpeakerphoneOn(true);
                else am.clearCommunicationDevice();
            }
        } else {
            am.setSpeakerphoneOn(on);
        }
    }

    /** Puts routing back to Android's default when a call ends. */
    static void reset(Context ctx) {
        AudioManager am = audio(ctx);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.clearCommunicationDevice();
        } catch (Throwable ignored) {}
    }

    private static boolean watching = false;

    /**
     * Reports route changes to the app. While a call is on and a headset or
     * Bluetooth device is connected, sound moves to it (loudspeaker off), as
     * on a normal phone call. Outside calls nothing is changed.
     */
    static void watch(Context ctx, Listener listener) {
        if (watching) return;
        AudioManager am = audio(ctx);
        if (am == null) return;
        watching = true;
        final Context app = ctx.getApplicationContext();
        final Handler main = new Handler(Looper.getMainLooper());
        am.registerAudioDeviceCallback(new AudioDeviceCallback() {
            // Android reports the devices already connected right after
            // registering; that first report is not a change.
            private boolean primed = false;

            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
                if (!primed) {
                    primed = true;
                    return;
                }
                boolean personal = false;
                for (AudioDeviceInfo d : added) {
                    if (d.isSink() && (isWired(d.getType()) || isBluetooth(d.getType()))) personal = true;
                }
                AudioManager m = audio(app);
                if (personal && m != null && m.getMode() == AudioManager.MODE_IN_COMMUNICATION) {
                    setSpeaker(app, false);
                }
                listener.onChange(state(app));
            }

            @Override
            public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
                primed = true;
                listener.onChange(state(app));
            }
        }, main);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                am.addOnCommunicationDeviceChangedListener(
                    app.getMainExecutor(),
                    device -> listener.onChange(state(app)));
            } catch (Throwable ignored) {}
        }
    }
}
