/**
 * Personal invite links. A link like https://www.chichatapp.com/i/Sulaimon
 * shows up in WhatsApp, Telegram, SMS and most chat apps as a ChiChat card
 * ("Sulaimon invited you to ChiChat"); tapping it opens the invite page
 * (api/invite.js) with the download button.
 */
export const INVITE_BASE = "https://www.chichatapp.com/i";

/** First word of a full name, or null when there is nothing usable. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  // Same rule as the invite page: letters, apostrophes, dots and hyphens.
  const clean = first.replace(/[^\p{L}\p{M}'.-]/gu, "").slice(0, 30);
  return clean || null;
}

export function inviteLink(firstName: string | null): string {
  return firstName ? `${INVITE_BASE}/${encodeURIComponent(firstName)}` : INVITE_BASE;
}

/** The message shared from Invite friends. */
export function inviteShareText(link: string): string {
  return `Hi! I'm inviting you to use ChiChat, high-quality voice & video calls and messaging. Join me here: ${link}`;
}

