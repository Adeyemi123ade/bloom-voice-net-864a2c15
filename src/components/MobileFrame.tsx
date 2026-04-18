import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * Full-viewport wrapper. The phone-frame outline was removed per design;
 * only the splash screen retains its own decorative frame.
 */
export default function MobileFrame({ children }: Props) {
  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <div className="relative w-full h-full bg-background overflow-hidden">
        {children}
      </div>
    </div>
  );
}
