import { Check } from "lucide-react";
import { PASSWORD_RULES, scorePassword } from "@/lib/passwordStrength";

interface Props {
  password: string;
  className?: string;
}

/**
 * Live password feedback under the password field:
 *   - a three-segment meter (Weak / Average / Strong) once the user types
 *   - ONE line of the rules ("8+ characters, a to z, A to Z, 0 to 9, ! @ # ?"),
 *     shown from the start, each part turning green with a tick when met.
 */
export default function PasswordStrengthBar({ password, className = "" }: Props) {
  const { level, label } = scorePassword(password);

  const colorClass = level === 3 ? "bg-accent" : level === 2 ? "bg-warning" : "bg-destructive";
  const labelColor = level === 3 ? "text-accent" : level === 2 ? "text-warning" : "text-destructive";

  return (
    <div className={`mt-2 ${className}`} aria-live="polite">
      {password && (
        <>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((seg) => (
              <div
                key={seg}
                className={`h-1.5 flex-1 rounded-full transition-colors ${seg <= level ? colorClass : "bg-secondary"}`}
              />
            ))}
          </div>
          <div className={`mt-1 flex items-center gap-1 text-xs font-semibold ${labelColor}`}>
            <span>{label} password</span>
            {level === 3 && <Check className="w-3.5 h-3.5" />}
          </div>
        </>
      )}
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {PASSWORD_RULES.map((rule, i) => {
          const met = rule.test(password);
          return (
            <span key={rule.key}>
              <span
                className={`inline-flex items-center gap-0.5 transition-colors ${met ? "text-accent font-semibold" : ""}`}
              >
                {met && <Check className="w-3 h-3" aria-hidden />}
                {rule.hint}
              </span>
              {i < PASSWORD_RULES.length - 1 && ", "}
            </span>
          );
        })}
      </p>
    </div>
  );
}
