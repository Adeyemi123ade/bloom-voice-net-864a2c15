import { useNavigate, useLocation } from "react-router-dom";
import { Home as HomeIcon, Phone, MessageSquare, Users, Settings as SettingsIcon } from "lucide-react";
import { useState } from "react";
import Dialpad from "@/components/Dialpad";

type TabKey = "home" | "calls" | "messages" | "contacts" | "settings";

interface Tab {
  key: TabKey;
  label: string;
  icon: typeof HomeIcon;
  to?: string;
}

const TABS: Tab[] = [
  { key: "calls", label: "Calls", icon: Phone },
  { key: "messages", label: "Messages", icon: MessageSquare, to: "/home" },
  { key: "contacts", label: "Contacts", icon: Users, to: "/contacts" },
  { key: "settings", label: "Settings", icon: SettingsIcon, to: "/settings" },
];

/**
 * Persistent bottom navigation. The icon for the screen the user is currently
 * on is hidden — never highlighted — so the bar always shows "where you can go
 * next" instead of "where you are".
 */
export default function BottomNav({
  active,
  onBeforeNavigate,
}: {
  active: TabKey;
  /** Called before any tab navigates — useful to close overlays first. */
  onBeforeNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [dialOpen, setDialOpen] = useState(false);

  const tabs = TABS.filter((t) => t.key !== active);

  const onTap = (t: Tab) => {
    if (t.key === "calls") {
      onBeforeNavigate?.();
      setDialOpen(true);
      return;
    }
    if (!t.to) return;
    onBeforeNavigate?.();
    if (location.pathname !== t.to) {
      navigate(t.to);
    }
  };

  return (
    <>
      <nav
        aria-label="Primary"
        // Deep ChiChat green, matching the phone's own navigation strip
        // below it (painted the same green by the Android app).
        className="fixed bottom-0 inset-x-0 z-30 pb-[env(safe-area-inset-bottom)]"
        style={{ backgroundColor: "hsl(var(--brand-deep))" }}
      >
        <ul className="mx-auto max-w-[520px] flex items-center justify-around px-2 py-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  aria-label={t.label}
                  onClick={() => onTap(t)}
                  className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl text-white/85 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors"
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-2xs font-medium">{t.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <Dialpad open={dialOpen} onOpenChange={setDialOpen} />
    </>
  );
}
