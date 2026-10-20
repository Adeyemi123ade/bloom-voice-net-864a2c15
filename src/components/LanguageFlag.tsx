import { BR, CN, DE, ES, FR, GB, IN, JP, KE, NG, RU, SA, TR } from "country-flag-icons/react/3x2";
import type { FlagCode } from "@/lib/i18n/strings";

const FLAGS: Record<FlagCode, typeof GB> = { GB, NG, FR, ES, BR, DE, SA, CN, IN, JP, KE, RU, TR };

/** A small flag drawn as an image (flag emoji don't show on Windows). */
export default function LanguageFlag({ code, className = "" }: { code: FlagCode; className?: string }) {
  const Flag = FLAGS[code];
  return <Flag aria-hidden className={`w-6 h-4 rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)] shrink-0 ${className}`} />;
}
