import { Check } from "lucide-react";
import { scorePassword } from "@/lib/passwordStrength";

interface Props {
  password: string;
  className?: string;
}

/**
 * Three-segment progress bar that shades segments based on password strength.
 *   Weak    → 1 red segment
 *   Average → 2 amber segments
 *   Strong  → 3 green segments + check mark
 */
export default function PasswordStrengthBar({ password, className = "" }: Props) {
  if (!password) return null;
  const { level, label } = scorePassword(password);

  const colorClass =
    level === 3
      ? "bg-[hsl(var(--accent))]"
      : level === 2
      ? "bg-amber-400"
      : "bg-destructive";

  const labelColor =
    level === 3
      ? "text-[hsl(var(--accent))]"
      : level === 2
      ? "text-amber-400"
      : "text-destructive";

  return (
    <div className={`mt-2 ${className}`} aria-live="polite">
      <div className="flex gap-1.5">
        {[1, 2, 3].map((seg) => (
          <div
            key={seg}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              seg <= level ? colorClass : "bg-secondary"
            }`}
          />
        ))}
      </div>
      <div className={`mt-1 flex items-center gap-1 text-base font-medium ${labelColor}`}>
        <span>{label} password</span>
        {level === 3 && <Check className="w-3.5 h-3.5" />}
      </div>
    </div>
  );
}
