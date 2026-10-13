import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";

/** OR divider between the main action and "Continue with Google". */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">or</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function AuthScreen({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <MobileFrame>
      <div className="h-full w-full overflow-y-auto flex justify-center bg-background">
        <div className="w-full max-w-sm sm:max-w-md flex flex-col px-5 sm:px-6 pt-4 pb-6 min-h-full">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors -ml-1 shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          {children}
        </div>
      </div>
    </MobileFrame>
  );
}
