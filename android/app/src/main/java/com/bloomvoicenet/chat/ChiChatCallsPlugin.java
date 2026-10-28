package com.bloomvoicenet.chat;

import android.app.AppOpsManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import java.lang.reflect.Method;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ChiChatCalls")
public class ChiChatCallsPlugin extends Plugin {

    @Override
    public void load() {
        // Headset or Bluetooth connected/disconnected, or the route changed:
        // the call screen keeps its loudspeaker button in step.
        try {
            CallAudioRoute.watch(getContext(), state -> notifyListeners("audioRouteChanged", state));
        } catch (Throwable ignored) {}
    }

    /** Loudspeaker on/off during a call. Answers with the route actually in use. */
    @PluginMethod
    public void setSpeakerphone(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        try {
            CallAudioRoute.setSpeaker(getContext(), on);
            call.resolve(CallAudioRoute.state(getContext()));
        } catch (Throwable t) {
            call.reject("Could not change the audio route: " + t.getMessage());
        }
    }

    /** Where call audio plays right now: { speaker, headset, bluetooth, inCall }. */
    @PluginMethod
    public void getAudioRoute(PluginCall call) {
        try {
            call.resolve(CallAudioRoute.state(getContext()));
        } catch (Throwable t) {
            call.reject("Could not read the audio route: " + t.getMessage());
        }
    }

    // ── FIX 1: minSdk > API 26, so startForegroundService() is always reachable.
    //           The SDK_INT branch is dropped entirely.
    @PluginMethod
    public void startForegroundCall(PluginCall call) {
        // Never let a refused foreground service crash the app; the call
        // itself still works without it, only background audio is affected.
        try {
            Intent i = new Intent(getContext(), CallForegroundService.class);
            getContext().startForegroundService(i);
            call.resolve();
        } catch (Throwable t) {
            call.reject("Could not start call service: " + t.getMessage());
        }
    }

    @PluginMethod
    public void stopForegroundCall(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), CallForegroundService.class));
        } catch (Throwable ignored) {}
        // A call answered on the lock screen: the lock screen comes back now.
        try {
            if (getActivity() instanceof MainActivity) {
                MainActivity a = (MainActivity) getActivity();
                a.runOnUiThread(a::releaseLockScreen);
            }
        } catch (Throwable ignored) {}
        call.resolve();
    }

    /**
     * "Run in background": opens Android's battery list, where the person
     * picks ChiChat and chooses "Don't optimise" (or "Unrestricted").
     * Google Play doesn't allow chat and calling apps that use Firebase to
     * ask for the one-tap exemption (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS),
     * so the list is used instead; if a phone has no such list, the app's
     * own settings page opens.
     */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            PowerManager pm = (PowerManager)
                    getContext().getSystemService(Context.POWER_SERVICE);
            String pkg = getContext().getPackageName();
            if (!pm.isIgnoringBatteryOptimizations(pkg)) {
                if (!tryStart(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) {
                    Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    details.setData(Uri.parse("package:" + pkg));
                    tryStart(details);
                }
            }
        } catch (Exception ignored) {}

        call.resolve(new JSObject().put("ok", true));
    }

    /**
     * Returns whether the user has granted the Full-Screen-Intent permission.
     * Required on Android 14 (API 34) + to wake the screen for incoming calls.
     */
    @PluginMethod
    public void canUseFullScreenIntent(PluginCall call) {
        boolean granted = true;

        // ── FIX 3: Replace magic number 34 with the named constant.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            NotificationManager nm = (NotificationManager)
                    getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            try {
                granted = nm.canUseFullScreenIntent();
            } catch (Throwable t) {
                granted = true;
            }
        }

        call.resolve(new JSObject().put("granted", granted));
    }

    @PluginMethod
    public void requestFullScreenIntentPermission(PluginCall call) {
        try {
            // ── FIX 3 (same): named constant instead of hardcoded 34.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(i);
            }
        } catch (Exception ignored) {}

        call.resolve(new JSObject().put("ok", true));
    }

    // ── Call setup check ────────────────────────────────────────────────
    // Everything that decides whether a call can ring while ChiChat is
    // closed or the phone is locked, so the app can show what's missing.

    private boolean isXiaomi() {
        String m = (Build.MANUFACTURER + " " + Build.BRAND).toLowerCase();
        return m.contains("xiaomi") || m.contains("redmi") || m.contains("poco");
    }

    /**
     * Xiaomi-only permissions ("Show on lock screen" = op 10020, "Display
     * pop-up windows while running in the background" = op 10021). Read
     * through a hidden API, so this returns null when it can't tell.
     */
    private Boolean xiaomiOpAllowed(int op) {
        try {
            AppOpsManager ops = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
            Method m = AppOpsManager.class.getMethod("checkOpNoThrow", int.class, int.class, String.class);
            Object r = m.invoke(ops, op, android.os.Process.myUid(), getContext().getPackageName());
            return r instanceof Integer && (Integer) r == AppOpsManager.MODE_ALLOWED;
        } catch (Throwable t) {
            return null;
        }
    }

    @PluginMethod
    public void getCallReadiness(PluginCall call) {
        JSObject r = new JSObject();
        Context ctx = getContext();
        try {
            r.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            boolean channelOn = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
                NotificationChannel ch = nm.getNotificationChannel(CallNotificationHelper.currentChannelId(ctx));
                if (ch != null) channelOn = ch.getImportance() != NotificationManager.IMPORTANCE_NONE;
            }
            r.put("callChannel", channelOn);
            boolean fsi = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && nm != null) {
                try { fsi = nm.canUseFullScreenIntent(); } catch (Throwable ignored) {}
            }
            r.put("fullScreen", fsi);
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            r.put("battery", pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
            boolean xiaomi = isXiaomi();
            r.put("xiaomi", xiaomi);
            if (xiaomi) {
                Boolean lock = xiaomiOpAllowed(10020);
                Boolean popup = xiaomiOpAllowed(10021);
                if (lock != null) r.put("lockScreen", lock);
                if (popup != null) r.put("backgroundPopups", popup);
            }
            r.put("manufacturer", Build.MANUFACTURER);
            r.put("model", Build.MODEL);
            r.put("android", Build.VERSION.RELEASE);
            r.put("sdk", Build.VERSION.SDK_INT);
        } catch (Throwable t) {
            r.put("error", String.valueOf(t.getMessage()));
        }
        call.resolve(r);
    }

    private boolean tryStart(Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    private void openAppDetails() {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        i.setData(Uri.parse("package:" + getContext().getPackageName()));
        tryStart(i);
    }

    /** Xiaomi "Other permissions": Show on lock screen, pop-ups in background. */
    @PluginMethod
    public void openLockScreenSettings(PluginCall call) {
        String pkg = getContext().getPackageName();
        boolean ok = false;
        if (isXiaomi()) {
            Intent i = new Intent("miui.intent.action.APP_PERM_EDITOR");
            i.setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity");
            i.putExtra("extra_pkgname", pkg);
            ok = tryStart(i);
            if (!ok) {
                Intent j = new Intent("miui.intent.action.APP_PERM_EDITOR");
                j.putExtra("extra_pkgname", pkg);
                ok = tryStart(j);
            }
        }
        if (!ok) openAppDetails();
        call.resolve();
    }

    /** Xiaomi Autostart list, so FCM can wake ChiChat after it's swiped away. */
    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        boolean ok = false;
        if (isXiaomi()) {
            Intent i = new Intent();
            i.setComponent(new ComponentName("com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"));
            ok = tryStart(i);
        }
        if (!ok) openAppDetails();
        call.resolve();
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        if (!tryStart(i)) openAppDetails();
        call.resolve();
    }

    /** App info page: on Xiaomi, Battery saver -> "No restrictions" lives here. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openAppDetails();
        call.resolve();
    }

    // ── Ringtone for calls while ChiChat is closed ──────────────────────
    // The web app sends its chosen tone in base64 pieces (files can be
    // 50 MB): begin, append…, commit. CallRinger plays the committed file.

    private java.io.File toneTmp() {
        java.io.File dir = new java.io.File(getContext().getFilesDir(), "ringtone");
        dir.mkdirs();
        return new java.io.File(dir, "incoming.tmp");
    }

    private String toneExt = "audio";

    @PluginMethod
    public void ringtoneBegin(PluginCall call) {
        String ext = call.getString("ext", "audio");
        toneExt = ext == null || !ext.matches("[a-z0-9]{1,5}") ? "audio" : ext;
        java.io.File tmp = toneTmp();
        if (tmp.exists() && !tmp.delete()) {
            call.reject("could not reset");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void ringtoneAppend(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("no data");
            return;
        }
        try (java.io.FileOutputStream out = new java.io.FileOutputStream(toneTmp(), true)) {
            out.write(android.util.Base64.decode(data, android.util.Base64.DEFAULT));
            call.resolve();
        } catch (Throwable t) {
            call.reject("write failed");
        }
    }

    @PluginMethod
    public void ringtoneCommit(PluginCall call) {
        java.io.File tmp = toneTmp();
        java.io.File dir = tmp.getParentFile();
        java.io.File target = new java.io.File(dir, "incoming_" + System.currentTimeMillis() + "." + toneExt);
        if (!tmp.isFile() || tmp.length() == 0 || !tmp.renameTo(target)) {
            call.reject("nothing to save");
            return;
        }
        getContext().getSharedPreferences(CallRinger.PREFS, Context.MODE_PRIVATE)
            .edit().putString(CallRinger.KEY_PATH, target.getAbsolutePath()).apply();
        java.io.File[] old = dir.listFiles();
        if (old != null) {
            for (java.io.File f : old) {
                if (!f.equals(target)) f.delete();
            }
        }
        call.resolve();
    }
}
