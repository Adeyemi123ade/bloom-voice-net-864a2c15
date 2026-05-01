// Password strength scoring used by Register and ResetPassword.
// Levels: 0 = none (empty), 1 = weak, 2 = average, 3 = strong.
//
// Rules (per project decision):
//   • Weak    — fewer than 8 characters
//   • Average — 8+ characters with at least 2 of: lower, upper, number, symbol
//   • Strong  — 11+ characters with all 4 categories (lower, upper, number, symbol)
//
// Anything that doesn't meet "average" but is 8+ stays weak.

export type StrengthLevel = 0 | 1 | 2 | 3;

export interface StrengthResult {
  level: StrengthLevel;
  label: "" | "Weak" | "Average" | "Strong";
}

export function scorePassword(pwd: string): StrengthResult {
  if (!pwd) return { level: 0, label: "" };

  const hasLower = /[a-z]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
  const categories = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;

  if (pwd.length < 8) return { level: 1, label: "Weak" };
  if (pwd.length >= 11 && categories === 4) return { level: 3, label: "Strong" };
  if (categories >= 2) return { level: 2, label: "Average" };
  return { level: 1, label: "Weak" };
}
