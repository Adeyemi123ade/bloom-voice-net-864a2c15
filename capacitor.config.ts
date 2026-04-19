import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.chichat",
  appName: "ChiChat",
  webDir: "dist",
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#0B8F6C",
      sound: "ringtone.wav",
    },
  },
};

export default config;
