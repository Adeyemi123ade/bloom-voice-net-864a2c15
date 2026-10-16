import { type CallReadiness, openCallSettings } from "@/lib/nativeCalls";

export type Status = "ok" | "missing" | "check";

export type CallSetupItem = {
  key: string;
  title: string;
  detail: string;
  status: Status;
  /** run resolves false when the button couldn't do its job. */
  action?: { label: string; run: () => Promise<boolean> };
};

/**
 * Everything the phone needs so a ChiChat call rings when the app is closed
 * or the screen is locked, with a button to fix each one and a test ring.
 */
export function buildCallSetupItems(
  r: CallReadiness | null,
  pushReady: boolean,
  pushProblem: string | null,
  onRetryPush: () => Promise<boolean>,
): CallSetupItem[] {
  const items: CallSetupItem[] = [];
  const s = (v: boolean | undefined): Status => (v === undefined ? "check" : v ? "ok" : "missing");

  items.push({
    key: "notifications",
    title: "Notifications allowed",
    detail: "Calls and messages arrive as notifications.",
    status: r?.notifications === false ? "missing" : s(r?.notifications),
    action: { label: "Open", run: () => openCallSettings("notifications") },
  });
  items.push({
    key: "push",
    title: "Phone registered for calls",
    detail: pushReady
      ? "ChiChat can wake this phone when someone calls."
      : pushProblem ?? "Still registering. Tap Retry if this doesn't turn green.",
    status: pushReady ? "ok" : "missing",
    action: pushReady ? undefined : { label: "Retry", run: onRetryPush },
  });
  if (r?.callChannel === false) {
    items.push({
      key: "channel",
      title: "Incoming call notifications on",
      detail: "The \"Incoming calls\" notification category is switched off.",
      status: "missing",
      action: { label: "Open", run: () => openCallSettings("notifications") },
    });
  }
  if ((r?.sdk ?? 0) >= 34) {
    items.push({
      key: "fullScreen",
      title: "Full-screen calls",
      detail: "Lets an incoming call light up the screen, like a phone call.",
      status: s(r?.fullScreen),
      action: { label: "Allow", run: () => openCallSettings("fullScreen") },
    });
  }
  if (r?.xiaomi) {
    items.push({
      key: "lockScreen",
      title: "Show on lock screen",
      detail: "Xiaomi: Other permissions → Show on Lock screen → Allow.",
      status: s(r.lockScreen),
      action: { label: "Open", run: () => openCallSettings("lockScreen") },
    });
    items.push({
      key: "popups",
      title: "Pop-up windows in background",
      detail: "Xiaomi: Other permissions → Display pop-up windows while running in the background → Allow.",
      status: s(r.backgroundPopups),
      action: { label: "Open", run: () => openCallSettings("lockScreen") },
    });
    items.push({
      key: "autostart",
      title: "Autostart",
      detail: "Xiaomi: turn on Autostart for ChiChat, or calls can't reach it after you swipe it away. The phone doesn't let apps read this one, so check it yourself.",
      status: "check",
      action: { label: "Open", run: () => openCallSettings("autostart") },
    });
  }
  items.push({
    key: "battery",
    title: "Battery: No restrictions",
    detail: r?.xiaomi
      ? "Xiaomi: App info → Battery saver → No restrictions."
      : "App info → Battery → Unrestricted.",
    status: s(r?.battery),
    action: { label: "Open", run: () => openCallSettings("app") },
  });
  return items;
}

