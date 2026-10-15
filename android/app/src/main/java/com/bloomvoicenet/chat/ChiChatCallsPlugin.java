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
import android.widget.Toast;
import androidx.core.app.NotificationManagerCompat;
import java.lang.reflect.Method;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ChiChatCalls")
public class ChiChatCallsPlugin extends Plugin {

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
        call.resolve();
    }

    // ── FIX 2: Replace ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (direct grant,
    //           Play Store restricted) with ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
    //           (opens the system list — always policy-compliant for VoIP apps).
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            PowerManager pm = (PowerManager)
                    getContext().getSystemService(Context.POWER_SERVICE);
            String pkg = getContext().getPackageName();

            if (!pm.isIgnoringBatteryOptimizations(pkg)) {
                Toast.makeText(
                        getContext(),
                        "Allow ChiChat to run in the background so calls can ring when your screen is off.",
                        Toast.LENGTH_LONG
                ).show();

                // Navigates to the battery-optimisation list; user manually
                // exempts the app. No restricted permission required.
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(i);
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
                Toast.makeText(
                        getContext(),
                        "Allow ChiChat to show full-screen incoming calls so the screen wakes when someone calls.",
                        Toast.LENGTH_LONG
                ).show();

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
                NotificationChannel ch = nm.getNotificationChannel(CallNotificationHelper.CHANNEL_ID);
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
}