import { ReactNode } from "react";
import BottomNav from "@/components/BottomNav";

type NavKey = "calls" | "messages" | "contacts" | "settings";

interface Props {
  children: ReactNode;
  /**
   * When provided, renders a persistent bottom-nav bar and reserves space
   * so content isn't covered. The matching tab is hidden in the nav itself.
   */
  bottomNav?: NavKey;
}

/**
 * Full-viewport wrapper. The phone-frame outline was removed per design;
 * only the splash screen retains its own decorative frame.
 */
export default function MobileFrame({ children, bottomNav }: Props) {
  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <div className="relative w-full h-full bg-background overflow-hidden">
        <div
          className={
            bottomNav
              ? "h-full pb-[72px]"
              : "h-full"
          }
        >
          {children}
        </div>
        {bottomNav && <BottomNav active={bottomNav} />}
      </div>
    </div>
  );
}
