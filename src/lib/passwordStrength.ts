// Password rules and strength scoring used by Register and ResetPassword.
//
// ONE rule set drives everything the user sees and what the app accepts:
//   at least 8 characters, a small letter, a capital letter, a number and a
//   special character.
// Strength = how many of the 5 rules are met:
//   • Weak    — 0 to 2
//   • Average — 3 or 4
//   • Strong  — all 5 (the only level that can create an account)

export type StrengthLevel = 0 | 1 | 2 | 3;

export interface StrengthResult {
  level: StrengthLevel;
  label: "" | "Weak" | "Average" | "Strong";
}

import type { TextKey } from "@/lib/i18n/strings";

export interface PasswordRule {
  key: "length" | "lower" | "upper" | "number" | "special";
  /** Translated versions of hint and message (see src/lib/i18n). */
  hintKey: TextKey | null;
  messageKey: TextKey;
  /** Short label shown in the one-line hint under the password field. */
  hint: string;
  /** Message shown if the form is submitted without meeting this rule. */
  message: string;
  test: (pwd: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { key: "length", hintKey: "pw.hintLength", messageKey: "pw.msgLength", hint: "8+ characters", message: "Password must be at least 8 characters", test: (p) => p.length >= 8 },
  { key: "lower", hintKey: "pw.hintLower", messageKey: "pw.msgLower", hint: "a to z", message: "Include at least one small letter", test: (p) => /[a-z]/.test(p) },
  { key: "upper", hintKey: "pw.hintUpper", messageKey: "pw.msgUpper", hint: "A to Z", message: "Include at least one capital letter", test: (p) => /[A-Z]/.test(p) },
  { key: "number", hintKey: "pw.hintNumber", messageKey: "pw.msgNumber", hint: "0 to 9", message: "Include at least one number", test: (p) => /[0-9]/.test(p) },
  { key: "special", hintKey: null, messageKey: "pw.msgSpecial", hint: "! @ # ?", message: "Include at least one special character, such as ! @ # ?", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** First rule the password doesn't meet, or null when it meets them all. */
export function firstUnmetPasswordRule(pwd: string): PasswordRule | null {
  return PASSWORD_RULES.find((r) => !r.test(pwd)) ?? null;
}

export function scorePassword(pwd: string): StrengthResult {
  if (!pwd) return { level: 0, label: "" };
  const met = PASSWORD_RULES.filter((r) => r.test(pwd)).length;
  if (met === PASSWORD_RULES.length) return { level: 3, label: "Strong" };
  if (met >= 3) return { level: 2, label: "Average" };
  return { level: 1, label: "Weak" };
}
