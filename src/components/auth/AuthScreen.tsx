import { useState, type ReactNode } from "react";
import { ArrowLeft, Globe } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import LanguagePicker from "@/components/LanguagePicker";
import { useLanguage } from "@/lib/i18n/context";
import { LANGUAGES } from "@/lib/i18n/strings";

/** OR divider between the main action and "Continue with Google". */
export function AuthDivider() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("auth.or")}</span>
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
  const { t, language } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);
  const languageName = LANGUAGES.find((l) => l.code === language)?.name ?? "English";
  return (
    <MobileFrame>
      <div className="h-full w-full overflow-y-auto flex justify-center bg-background">
        <div className="w-full max-w-sm sm:max-w-md flex flex-col px-5 sm:px-6 pt-4 pb-6 min-h-full">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              aria-label={t("auth.back")}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors -ml-1 shrink-0"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            {/* Language can be changed here too, not only on the welcome screen. */}
            <button
              type="button"
              onClick={() => setLangOpen(true)}
              aria-label={t("lang.title")}
              className="h-9 px-3 rounded-full flex items-center gap-1.5 text-sm font-semibold text-foreground border border-border hover:bg-secondary"
            >
              <Globe className="w-4 h-4" aria-hidden />
              {languageName}
            </button>
          </div>
          <LanguagePicker open={langOpen} onOpenChange={setLangOpen} />
          {children}
        </div>
      </div>
    </MobileFrame>
  );
}
