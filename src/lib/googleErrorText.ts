import { tNow } from "@/lib/i18n/language";
import { GoogleSignInError } from "@/lib/googleAuth";
import type { TextKey } from "@/lib/i18n/strings";

/** Shortens Google's / Supabase's message for the "Details" line. */
function short(detail: string): string {
  const d = detail.replace(/^androidx\.credentials\.[\w.]*:\s*/i, "").replace(/\s+/g, " ").trim();
  return d.length > 80 ? `${d.slice(0, 77)}…` : d;
}

/**
 * The notice for a Google sign-in that didn't finish: plain words first,
 * then Google's own reason on a "Details" line, so nobody is left guessing
 * and testers can report the exact cause.
 */
export function googleErrorText(error: Error, fallbackBody: TextKey): { description: string } {
  if (error instanceof GoogleSignInError) {
    const body =
      error.kind === "setup"
        ? tNow("google.setupBody")
        : error.kind === "no_account"
          ? tNow("google.noAccountBody")
          : tNow(fallbackBody);
    // A known cause ("setup": this app version isn't registered with Google)
    // gets plain words only; Google's own message is kept in the problem log.
    const detail = error.kind === "setup" ? "" : short(error.detail);
    return { description: detail ? `${body} ${tNow("google.detail", { detail })}` : body };
  }
  return { description: tNow(fallbackBody) };
}
