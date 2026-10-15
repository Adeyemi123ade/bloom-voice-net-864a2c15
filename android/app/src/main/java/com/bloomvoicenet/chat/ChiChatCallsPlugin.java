package com.bloomvoicenet.chat;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.widget.Toast;

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
}