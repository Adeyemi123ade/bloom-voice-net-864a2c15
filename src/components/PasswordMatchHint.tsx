import { Check, X } from "lucide-react";

/** Live "Passwords match / don't match" line under a confirm-password field. */
export default function PasswordMatchHint({ password, confirm }: { password: string; confirm: string }) {
  if (!confirm) return null;
  const match = password === confirm;
  return (
    <p
      aria-live="polite"
      className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${match ? "text-accent" : "text-destructive"}`}
    >
      {match ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
      {match ? "Passwords match" : "Passwords don't match"}
    </p>
  );
}
