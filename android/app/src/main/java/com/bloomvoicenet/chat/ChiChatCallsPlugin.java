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
    @PluginMethod
    public void startForegroundCall(PluginCall call) {
        Intent i = new Intent(getContext(), CallForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(i);
        else getContext().startService(i);
        call.resolve();
    }

    @PluginMethod
    public void stopForegroundCall(PluginCall call) {
        getContext().stopService(new Intent(getContext(), CallForegroundService.class));
        call.resolve();
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            String pkg = getContext().getPackageName();
            if (!pm.isIgnoringBatteryOptimizations(pkg)) {
                Toast.makeText(getContext(),
                    "Allow ChiChat to run in the background so calls can ring when your screen is off.",
                    Toast.LENGTH_LONG).show();
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + pkg));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(i);
            }
        } catch (Exception ignored) {}
        call.resolve(new JSObject().put("ok", true));
    }

    /**
     * Returns whether the user has granted the "Display over other apps while
     * locked" Full-Screen-Intent permission. On Android 14+ apps must request
     * this from the user before the system will wake the screen for an
     * incoming call notification.
     */
    @PluginMethod
    public void canUseFullScreenIntent(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager) getContext()
                .getSystemService(Context.NOTIFICATION_SERVICE);
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
            if (Build.VERSION.SDK_INT >= 34) {
                Toast.makeText(getContext(),
                    "Allow ChiChat to show full-screen incoming calls so the screen wakes when someone calls.",
                    Toast.LENGTH_LONG).show();
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(i);
            }
        } catch (Exception ignored) {}
        call.resolve(new JSObject().put("ok", true));
    }
}
