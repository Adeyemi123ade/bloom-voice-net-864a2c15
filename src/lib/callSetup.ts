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
    title: "Ready to receive calls",
    detail: pushReady
      ? "ChiChat can ring this phone even when the app is closed."
      : pushProblem ?? "Setting up. If this doesn't turn green, tap Try again.",
    status: pushReady ? "ok" : "missing",
    action: pushReady ? undefined : { label: "Try again", run: onRetryPush },
  });
  if (r?.callChannel === false) {
    items.push({
      key: "channel",
      title: "Call notifications on",
      detail: "Call notifications are switched off. Tap Open and turn on \"Incoming calls\".",
      status: "missing",
      action: { label: "Open", run: () => openCallSettings("notifications") },
    });
  }
  if ((r?.sdk ?? 0) >= 34) {
    items.push({
      key: "fullScreen",
      title: "Full-screen calls",
      detail: "Lets a call fill the screen, like a normal phone call.",
      status: s(r?.fullScreen),
      action: { label: "Allow", run: () => openCallSettings("fullScreen") },
    });
  }
  if (r?.xiaomi) {
    items.push({
      key: "lockScreen",
      title: "Show on lock screen",
      detail: "Tap Open, then Other permissions → Show on Lock screen → Allow.",
      status: s(r.lockScreen),
      action: { label: "Open", run: () => openCallSettings("lockScreen") },
    });
    items.push({
      key: "popups",
      title: "Show calls over other apps",
      detail: "Tap Open, then Other permissions → Display pop-up windows while running in the background → Allow.",
      status: s(r.backgroundPopups),
      action: { label: "Open", run: () => openCallSettings("lockScreen") },
    });
    items.push({
      key: "autostart",
      title: "Autostart",
      detail: "Turn on Autostart for ChiChat so calls still reach you after you close the app. Your phone doesn't show us this one, so please check it.",
      status: "check",
      action: { label: "Open", run: () => openCallSettings("autostart") },
    });
  }
  items.push({
    key: "battery",
    title: "Battery: No restrictions",
    detail: r?.xiaomi
      ? "So your phone doesn't pause ChiChat. Tap Open, then Battery saver → No restrictions."
      : "So your phone doesn't pause ChiChat. Tap Open, then Battery → Unrestricted.",
    status: s(r?.battery),
    action: { label: "Open", run: () => openCallSettings("app") },
  });
  return items;
}

