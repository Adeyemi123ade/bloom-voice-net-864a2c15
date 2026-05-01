import chichatLogo from "@/assets/chichat-logo.png";

/**
 * ChiChat brand banner used across access/auth/invite screens.
 *
 * Mirrors the design used in our auth emails:
 *   - solid #0B5D3B background plate (no gradients, no opacity)
 *   - logo + "ChiChat" wordmark + tagline
 *   - smartphone mockup (decorative)
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
      className={`w-full rounded-2xl overflow-hidden ${className}`}
      style={{ backgroundColor: "#0B5D3B" }}
      aria-label="ChiChat"
    >
      <div className="px-5 py-5 flex items-center gap-4">
        {/* Left: brand mark */}
        <div className="flex flex-col items-start min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <img
              src={chichatLogo}
              alt="ChiChat"
              className="w-11 h-11 object-contain"
            />
            <div className="min-w-0">
              <h2
                className="text-lg font-extrabold leading-none"
                style={{ color: "#FFFFFF" }}
              >
                ChiChat
              </h2>
              <p
                className="text-[11px] mt-1 leading-none"
                style={{ color: "#FFFFFF" }}
              >
                Experience the possibilities
              </p>
            </div>
          </div>
          {message ? (
            <p
              className="text-xs mt-3 leading-snug"
              style={{ color: "#FFFFFF" }}
            >
              {message}
            </p>
          ) : null}
        </div>

        {/* Right: tiny phone mockup (decorative) */}
        <div
          aria-hidden
          className="shrink-0 w-[58px] h-[88px] rounded-[14px] p-[3px] hidden xs:block"
          style={{ backgroundColor: "#121212" }}
        >
          <div
            className="w-full h-full rounded-[11px] flex items-center justify-center"
            style={{ backgroundColor: "#FFFFFF" }}
          >
            <img
              src={chichatLogo}
              alt=""
              className="w-8 h-8 object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default BrandHero;
