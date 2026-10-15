import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bloomvoicenet.chat",
  appName: "ChiChat",
  webDir: "dist",
  // The app shows the live site, so every web update (merged to main and
  // deployed by Vercel) reaches phones at once, with no APK rebuild. Only
  // changes to the Android code itself (android/) need a new APK. Remove this
  // block to go back to a frozen copy of the web app inside the APK.
  server: {
    url: "https://chichatapp.com",
    cleartext: false,
    // Keep both addresses inside the app (if one redirects to the other,
    // the app must not jump out to the phone's browser).
    allowNavigation: ["chichatapp.com", "www.chichatapp.com"],
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
