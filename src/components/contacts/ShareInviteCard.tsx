import { useState } from "react";
import { Copy, Share2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { APP_INVITE_LINK } from "./contactsHelpers";
import { isNativePlatform } from "@/lib/deviceContacts";

const SHARE_TEXT = `Hi! I'm inviting you to use Chichat — high-quality voice & video calls and messaging. Download here: ${APP_INVITE_LINK}`;

/* -------------------------------------------------------------------------- */
/* Web fallback chooser — only used when navigator.share is unavailable        */
/* (e.g. desktop browsers, the in-iframe preview).                             */
/* On the real Android/iOS app, the OS system share sheet is used instead.     */
/* -------------------------------------------------------------------------- */

type Target = {
  id: string;
  label: string;
  emoji: string;
  href: (text: string, url: string) => string;
};

const TARGETS: Target[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    emoji: "🟢",
    href: (text) => `https://wa.me/?text=${encodeURIComponent(text)}`,
  },
  {
    id: "sms",
    label: "SMS",
    emoji: "💬",
    href: (text) => `sms:?&body=${encodeURIComponent(text)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    emoji: "✈️",
    href: (text, url) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: "messenger",
    label: "Messenger",
    emoji: "💙",
    href: (_text, url) =>
      `https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&app_id=140586622674265&redirect_uri=${encodeURIComponent(url)}`,
  },
  {
    id: "email",
    label: "Email",
    emoji: "✉️",
    href: (text) =>
      `mailto:?subject=${encodeURIComponent("Join me on Chichat")}&body=${encodeURIComponent(text)}`,
  },
  {
    id: "x",
    label: "X / Twitter",
    emoji: "𝕏",
    href: (text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
  },
];

export function ShareInviteCard() {
  const link = APP_INVITE_LINK;
  const [chooserOpen, setChooserOpen] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_TEXT);
      toast({ title: "Invite copied", description: "Paste it anywhere." });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  /** Try native chooser first; if unavailable, open our in-app chooser sheet. */
  const share = async () => {
    const shared = await openNativeShare(SHARE_TEXT, link);
    if (!shared) setChooserOpen(true);
  };

  return (
    <>
      <div className="mx-4 rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-primary/70 p-6 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            <span className="text-3xl font-extrabold text-primary-foreground">C</span>
          </div>
          <p className="mt-3 text-base font-bold text-primary-foreground">
            Join me on Chichat
          </p>
          <p className="mt-1 text-xs text-primary-foreground/85">
            Free voice &amp; video calls, messaging, and more.
          </p>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/60 border border-border">
            <p className="flex-1 text-xs text-muted-foreground truncate">{link}</p>
            <button
              onClick={copy}
              aria-label="Copy invite link"
              className="text-xs font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </button>
          </div>

          <button
            onClick={share}
            className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold inline-flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Send invite
          </button>

          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Pick any app — WhatsApp, SMS, Gmail and more. Your friend gets the message
            along with the download link.
          </p>
        </div>
      </div>

      <ShareChooserSheet
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        text={SHARE_TEXT}
        url={link}
        onCopy={copy}
      />
    </>
  );
}

/** Programmatic invite trigger — used by the Contacts list "Invite" button.
 *  Returns true when the OS share sheet was shown; false to let the caller
 *  navigate to the dedicated /invite screen (which has the in-app chooser). */
export async function shareChichatInvite(personalNote?: string) {
  const text = personalNote ? `${personalNote}\n\n${SHARE_TEXT}` : SHARE_TEXT;
  return openNativeShare(text, APP_INVITE_LINK);
}

async function openNativeShare(text: string, url: string) {
  if (isNativePlatform()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: "Chichat", text, url, dialogTitle: "Send invite with" });
      return true;
    } catch {
      return false;
    }
  }
  const nav = navigator as Navigator & {
    share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    canShare?: (data: { title?: string; text?: string; url?: string }) => boolean;
  };
  if (nav.share) {
    try {
      const data = { title: "Chichat", text, url };
      if (nav.canShare && !nav.canShare(data)) return false;
      await nav.share(data);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Web chooser sheet                                                          */
/* -------------------------------------------------------------------------- */

function ShareChooserSheet({
  open,
  onClose,
  text,
  url,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  text: string;
  url: string;
  onCopy: () => void;
}) {
  if (!open) return null;

  const pick = (t: Target) => {
    const href = t.href(text, url);
    window.open(href, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-label="Share invite"
    >
      <div
        className="w-full max-w-md bg-background rounded-t-3xl border-t border-border p-4 pb-6 animate-in slide-in-from-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-foreground">Share via</h3>
          <button
            aria-label="Close"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        <div className="px-3 py-2 mb-3 rounded-lg bg-secondary/60 border border-border">
          <p className="text-xs text-muted-foreground line-clamp-2">{text}</p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {TARGETS.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-secondary"
            >
              <span className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-2xl">
                {t.emoji}
              </span>
              <span className="text-[11px] font-semibold text-foreground">{t.label}</span>
            </button>
          ))}
          <button
            onClick={() => {
              onCopy();
              onClose();
            }}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-secondary"
          >
            <span className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Copy className="w-5 h-5 text-foreground" />
            </span>
            <span className="text-[11px] font-semibold text-foreground">Copy link</span>
          </button>
        </div>
      </div>
    </div>
  );
}
