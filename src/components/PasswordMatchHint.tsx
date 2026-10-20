import { Check, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/context";

/** Live "Passwords match / don't match" line under a confirm-password field. */
export default function PasswordMatchHint({ password, confirm }: { password: string; confirm: string }) {
  const { t } = useLanguage();
  if (!confirm) return null;
  const match = password === confirm;
  return (
    <p
      aria-live="polite"
      className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${match ? "text-accent" : "text-destructive"}`}
    >
      {match ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
      {match ? t("reg.passwordsMatch") : t("reg.passwordsDontMatch")}
    </p>
  );
}
