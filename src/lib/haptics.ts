import { Capacitor } from "@capacitor/core";

/** A short tap you can feel, so a press is acknowledged even before the screen changes. */
export function tapFeedback(): void {
  try {
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/haptics")
        .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
        .catch(() => {});
      return;
    }
    (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(15);
  } catch {
    /* ignore */
  }
}
