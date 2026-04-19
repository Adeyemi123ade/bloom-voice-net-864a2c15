import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.84da0127858b4a61998660ed33bc4997",
  appName: "ChiChat",
  webDir: "dist",
  server: {
    url: "https://84da0127-858b-4a61-9986-60ed33bc4997.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#0B8F6C",
      sound: "ringtone.wav",
    },
  },
};

export default config;
