package com.bloomvoicenet.chat;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
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
            PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
            String pkg = getContext().getPackageName();
            if (!pm.isIgnoringBatteryOptimizations(pkg)) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + pkg));
                getActivity().startActivity(i);
            }
        } catch (Exception ignored) {}
        call.resolve(new JSObject().put("ok", true));
    }
}
