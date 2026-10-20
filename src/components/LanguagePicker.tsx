import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n/context";
import { LANGUAGES } from "@/lib/i18n/strings";

/**
 * The list of languages, each in its own language, so someone who doesn't
 * read English can still find theirs.
 */
export default function LanguagePicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t("lang.choose")}</DialogTitle>
          <DialogDescription>{t("lang.note")}</DialogDescription>
        </DialogHeader>
        <ul className="mt-1 rounded-xl border border-border overflow-hidden">
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
                className={`w-full flex items-center gap-3 px-4 min-h-[52px] text-left text-base font-medium text-foreground hover:bg-secondary ${i ? "border-t border-border" : ""}`}
              >
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
