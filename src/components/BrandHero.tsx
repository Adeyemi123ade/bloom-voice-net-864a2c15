import chichatLogo from "@/assets/chichat-logo.png";

/**
 * ChiChat brand banner used across access/auth/invite screens.
 *
 * Mirrors the design used in our auth emails:
 *   - solid brand-deep background plate (theme token --brand-deep; no gradients, no opacity)
 *   - logo on a white tile + "ChiChat" wordmark + tagline
 *   - optional message across the full width underneath
 *
 * NEVER apply opacity to the green here — brand rule.
 */
export function BrandHero({
  message,
  className = "",
}: {
  message?: string;
  className?: string;
}) {
  return (
    <section
      className={`w-full rounded-[18px] overflow-hidden ${className}`}
      style={{ backgroundColor: "hsl(var(--brand-deep))" }}
      aria-label="ChiChat"
    >
      <div className="px-4 py-3.5 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
        <span className="w-12 h-12 rounded-xl bg-white p-1 flex items-center justify-center shrink-0">
          <img src={chichatLogo} alt="ChiChat" className="w-full h-full object-contain" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight" style={{ color: "#FFFFFF" }}>
            ChiChat
          </h2>
          <p className="text-xs mt-0.5 leading-snug" style={{ color: "#FFFFFF" }}>
            Experience the possibilities
          </p>
        </div>
        {message ? (
          <p className="col-span-2 text-[13px] mt-1.5 leading-snug" style={{ color: "#FFFFFF" }}>
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default BrandHero;
