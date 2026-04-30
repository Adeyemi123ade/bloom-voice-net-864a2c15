import { useState } from "react";
import { Copy, Share2, X, Mail, MessageSquare, Link as LinkIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { APP_INVITE_LINK } from "./contactsHelpers";
import { isNativePlatform } from "@/lib/deviceContacts";

const SHARE_TEXT = `Hi! I'm inviting you to use Chichat — high-quality voice & video calls and messaging. Download here: ${APP_INVITE_LINK}`;

/* -------------------------------------------------------------------------- */
/* Brand icons (inline SVGs so they render without external assets)            */
/* -------------------------------------------------------------------------- */

const IconWhatsApp = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <path
      fill="#25D366"
      d="M16 .5C7.44.5.5 7.44.5 16c0 2.82.74 5.47 2.04 7.77L.5 31.5l7.95-2.05A15.45 15.45 0 0 0 16 31.5C24.56 31.5 31.5 24.56 31.5 16S24.56.5 16 .5z"
    />
    <path
      fill="#FFF"
      d="M23.4 19.7c-.3-.16-1.86-.92-2.15-1.02-.29-.1-.5-.16-.71.16-.21.32-.82 1.02-1 1.23-.18.21-.37.24-.69.08-.32-.16-1.36-.5-2.59-1.6-.96-.86-1.6-1.91-1.79-2.23-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.55.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54-.18 0-.4-.01-.61-.01-.21 0-.55.08-.84.4-.29.32-1.1 1.07-1.1 2.62s1.13 3.04 1.29 3.25c.16.21 2.22 3.39 5.39 4.75.75.32 1.34.52 1.8.66.76.24 1.45.21 2 .13.61-.09 1.86-.76 2.13-1.49.26-.74.26-1.37.18-1.49-.07-.13-.27-.21-.57-.37z"
    />
  </svg>
);

const IconMessenger = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <defs>
      <linearGradient id="msgr" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#0099FF" />
        <stop offset="1" stopColor="#A033FF" />
      </linearGradient>
    </defs>
    <path
      fill="url(#msgr)"
      d="M16 1C7.44 1 1 7.36 1 15.65c0 4.34 1.78 8.07 4.66 10.62V31l4.27-2.34c1.94.54 4 .77 6.07.77 8.56 0 15-6.36 15-14.65S24.56 1 16 1z"
    />
    <path
      fill="#FFF"
      d="m6.46 19.71 4.4-7 4.6 3.5 4.31-3.5 4.4 3.5-4.4 7-4.42-3.5-4.49 3.5z"
    />
  </svg>
);

const IconInstagram = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <defs>
      <radialGradient id="ig" cx="30%" cy="107%" r="150%">
        <stop offset="0" stopColor="#FDF497" />
        <stop offset=".05" stopColor="#FDF497" />
        <stop offset=".45" stopColor="#FD5949" />
        <stop offset=".6" stopColor="#D6249F" />
        <stop offset="0.9" stopColor="#285AEB" />
      </radialGradient>
    </defs>
    <rect width="32" height="32" rx="8" fill="url(#ig)" />
    <path
      fill="none"
      stroke="#FFF"
      strokeWidth="2"
      d="M10 7h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3z"
    />
    <circle cx="16" cy="16" r="4.5" fill="none" stroke="#FFF" strokeWidth="2" />
    <circle cx="22.2" cy="9.8" r="1.3" fill="#FFF" />
  </svg>
);

const IconTelegram = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <circle cx="16" cy="16" r="16" fill="#229ED9" />
    <path
      fill="#FFF"
      d="m7.4 15.5 15.7-6.05c.73-.27 1.37.18 1.13 1.29l-2.67 12.6c-.2.94-.76 1.17-1.55.73l-4.28-3.16-2.07 1.99c-.23.23-.42.42-.86.42l.31-4.36 7.94-7.18c.35-.31-.08-.48-.54-.18l-9.81 6.18-4.23-1.32c-.92-.29-.94-.92.18-1.36z"
    />
  </svg>
);

const IconGmail = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <rect x="2" y="6" width="28" height="20" rx="3" fill="#FFF" stroke="#E0E0E0" />
    <path d="M2 9l14 9 14-9" fill="none" stroke="#EA4335" strokeWidth="2.5" />
    <path d="M2 9v17h6V14L2 9z" fill="#C5221F" />
    <path d="M30 9v17h-6V14l6-5z" fill="#EA4335" />
  </svg>
);

const IconX = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <rect width="32" height="32" rx="8" fill="#000" />
    <path
      fill="#FFF"
      d="M22.6 7h2.8l-6.1 7 7.2 11h-5.65l-4.43-6.78L11 25H8.2l6.55-7.5L7.8 7h5.79l4 6.18zm-1 16.3h1.55L11.5 8.6H9.85z"
    />
  </svg>
);

const IconSMS = ({ className = "w-7 h-7" }: { className?: string }) => (
  <div className={`${className} rounded-full bg-[#34C759] flex items-center justify-center`}>
    <MessageSquare className="w-4 h-4 text-white" strokeWidth={2.5} />
  </div>
);

const IconEmail = ({ className = "w-7 h-7" }: { className?: string }) => (
  <div className={`${className} rounded-full bg-[#0A84FF] flex items-center justify-center`}>
    <Mail className="w-4 h-4 text-white" strokeWidth={2.5} />
  </div>
);

const IconCopyLink = ({ className = "w-7 h-7" }: { className?: string }) => (
  <div className={`${className} rounded-full bg-secondary flex items-center justify-center`}>
    <LinkIcon className="w-4 h-4 text-foreground" strokeWidth={2.5} />
  </div>
);

/* -------------------------------------------------------------------------- */
/* Share targets                                                              */
/* -------------------------------------------------------------------------- */

type Target = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Open the platform; return false if it definitely failed. */
  open: (text: string, url: string) => Promise<boolean> | boolean;
};

/** Try a custom URI scheme, fall back to a web URL if nothing handles it. */
function openWithFallback(primary: string, fallback: string) {
  // Open fallback in a new tab so the share text is preserved if the scheme
  // isn't handled by any installed app.
  const fb = window.open(fallback, "_blank", "noopener,noreferrer");
  // Some browsers block popups; either way, also try the deep-link.
  try {
    // Use location assignment via hidden iframe so the page itself doesn't navigate away.
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = primary;
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 1500);
  } catch {
    /* ignore */
  }
  return !!fb || true;
}

const TARGETS: Target[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: IconWhatsApp,
    // wa.me works for BOTH WhatsApp Messenger and WhatsApp Business —
    // the OS lets the user pick which one handles the link.
    open: (text) => {
      const encoded = encodeURIComponent(text);
      return openWithFallback(
        `whatsapp://send?text=${encoded}`,
        `https://wa.me/?text=${encoded}`,
      );
    },
  },
  {
    id: "messenger",
    label: "Messenger",
    icon: IconMessenger,
    open: (text, url) => {
      const encoded = encodeURIComponent(url);
      return openWithFallback(
        `fb-messenger://share/?link=${encoded}`,
        `https://www.facebook.com/sharer/sharer.php?u=${encoded}&quote=${encodeURIComponent(text)}`,
      );
    },
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: IconInstagram,
    // Instagram has no public web share endpoint — copy the invite and
    // open Instagram so the user can paste it into a DM or story.
    open: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({
          title: "Invite copied",
          description: "Paste it into your Instagram chat or story.",
        });
      } catch {
        /* ignore */
      }
      window.open("https://www.instagram.com/direct/inbox/", "_blank", "noopener,noreferrer");
      return true;
    },
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: IconTelegram,
    open: (text, url) =>
      openWithFallback(
        `tg://msg_url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
        `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      ),
  },
  {
    id: "sms",
    label: "SMS",
    icon: IconSMS,
    open: (text) => {
      window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
      return true;
    },
  },
  {
    id: "gmail",
    label: "Gmail",
    icon: IconGmail,
    open: (text) =>
      openWithFallback(
        `googlegmail://co?subject=${encodeURIComponent("Join me on Chichat")}&body=${encodeURIComponent(text)}`,
        `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent("Join me on Chichat")}&body=${encodeURIComponent(text)}`,
      ),
  },
  {
    id: "email",
    label: "Email",
    icon: IconEmail,
    open: (text) => {
      window.location.href = `mailto:?subject=${encodeURIComponent("Join me on Chichat")}&body=${encodeURIComponent(text)}`;
      return true;
    },
  },
  {
    id: "x",
    label: "X",
    icon: IconX,
    open: (text) => {
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return true;
    },
  },
];

/* -------------------------------------------------------------------------- */

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
            Pick any app — WhatsApp, Messenger, Instagram, Gmail and more. Your friend
            gets the message along with the download link.
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

  const pick = async (t: Target) => {
    try {
      await t.open(text, url);
    } catch {
      toast({
        title: `Couldn't open ${t.label}`,
        description: "We've copied the invite — paste it into the app.",
      });
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* ignore */
      }
    }
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
          {TARGETS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => pick(t)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-secondary"
              >
                <Icon className="w-11 h-11" />
                <span className="text-[11px] font-semibold text-foreground">{t.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => {
              onCopy();
              onClose();
            }}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl hover:bg-secondary"
          >
            <IconCopyLink className="w-11 h-11" />
            <span className="text-[11px] font-semibold text-foreground">Copy link</span>
          </button>
        </div>
      </div>
    </div>
  );
}
