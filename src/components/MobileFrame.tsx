import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

/**
 * Centered mobile-frame wrapper used by all post-splash screens.
 * Matches the splash frame outline so the experience feels continuous.
 */
export default function MobileFrame({ children }: Props) {
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center overflow-hidden">
      <div
        className="relative bg-card overflow-hidden shadow-2xl"
        style={{
          width: "min(312px, 80vw)",
          height: "min(473px, 100vh)",
          borderRadius: "44px",
          border: "1px solid hsl(var(--border))",
          boxShadow:
            "0 0 0 1px hsl(var(--border) / 0.4), 0 30px 60px -20px hsl(0 0% 0% / 0.8)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
