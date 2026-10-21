import { WifiOff } from "lucide-react";
import { useIsOnline } from "@/lib/network";
import { useLanguage } from "@/lib/i18n/context";

/**
 * A small strip at the top of every screen while the phone has no internet.
 * The app stays usable (saved chats show); nothing else opens.
 */
export default function OfflineBanner() {
  const online = useIsOnline();
  const { t } = useLanguage();
  if (online) return null;
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="fixed top-0 inset-x-0 z-[100] flex justify-center pointer-events-none"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 6px)" }}
    >
      <span className="flex items-center gap-2 rounded-full bg-foreground/90 text-background text-xs font-medium px-3 py-1.5 shadow">
        <WifiOff className="w-3.5 h-3.5" />
        {t("login.offlineTitle")}
      </span>
    </div>
  );
}
