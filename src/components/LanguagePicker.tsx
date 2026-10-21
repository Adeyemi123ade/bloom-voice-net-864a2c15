import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LanguageFlag from "@/components/LanguageFlag";
import { useLanguage } from "@/lib/i18n/context";
import { LANGUAGES } from "@/lib/i18n/strings";

/**
 * The list of languages, each in its own language with a flag, so someone
 * who doesn't read English can still find theirs.
 */
export default function LanguagePicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] rounded-2xl max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("lang.choose")}</DialogTitle>
          <DialogDescription className="sr-only">{t("lang.title")}</DialogDescription>
        </DialogHeader>
        <ul className="mt-1 rounded-xl border border-border overflow-y-auto min-h-0">
          {LANGUAGES.map((l, i) => (
            <li key={l.code}>
              <button
                type="button"
                lang={l.code}
                onClick={() => {
                  setLanguage(l.code);
                  onOpenChange(false);
                }}
                aria-pressed={language === l.code}
                className={`w-full flex items-center gap-3 px-4 min-h-[52px] text-start text-base font-medium text-foreground hover:bg-secondary ${i ? "border-t border-border" : ""}`}
              >
                <LanguageFlag code={l.flag} />
                <span className="flex-1">{l.name}</span>
                {language === l.code && <Check className="w-5 h-5 text-primary" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
