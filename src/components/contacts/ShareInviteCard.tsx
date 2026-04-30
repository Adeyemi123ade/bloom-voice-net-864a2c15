import { useState } from "react";
import { Copy, MessageCircle, Share2, X, Mail, MessageSquare, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { APP_INVITE_LINK } from "./contactsHelpers";
import { isNativePlatform } from "@/lib/deviceContacts";

const SHARE_TEXT = `Hi! I'm inviting you to use Chichat — high-quality voice & video calls and messaging. Download here: ${APP_INVITE_LINK}`;

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

  /** Try native OS chooser first; if unavailable, open our in-app chooser. */
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

      <AppChooserSheet
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        text={SHARE_TEXT}
        link={link}
        onCopy={copy}
      />
    </>
  );
}

/** Programmatic invite trigger — used by the Contacts list "Invite" button. */
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

type Target = {
  id: string;
  label: string;
  bg: string;
  icon: React.ReactNode;
  href: (text: string, url: string) => string;
};

const TARGETS: Target[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    bg: "bg-[#25D366]",
    icon: <MessageCircle className="w-6 h-6 text-white" />,
    href: (t) => `https://wa.me/?text=${encodeURIComponent(t)}`,
  },
  {
    id: "sms",
    label: "SMS",
    bg: "bg-blue-500",
    icon: <MessageSquare className="w-6 h-6 text-white" />,
    href: (t) => `sms:?&body=${encodeURIComponent(t)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    bg: "bg-[#229ED9]",
    icon: <Send className="w-6 h-6 text-white" />,
    href: (t, u) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  },
  {
    id: "gmail",
    label: "Gmail",
    bg: "bg-red-500",
    icon: <Mail className="w-6 h-6 text-white" />,
    href: (t) => `mailto:?subject=${encodeURIComponent("Join me on Chichat")}&body=${encodeURIComponent(t)}`,
  },
  {
    id: "messenger",
    label: "Messenger",
    bg: "bg-[#0084FF]",
    icon: <MessageCircle className="w-6 h-6 text-white" />,
    href: (_t, u) => `fb-messenger://share?link=${encodeURIComponent(u)}`,
  },
  {
    id: "x",
    label: "X",
    bg: "bg-black",
    icon: <span className="text-white font-bold text-lg leading-none">𝕏</span>,
    href: (t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}`,
  },
];

function AppChooserSheet({
  open,
  onClose,
  text,
  link,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  text: string;
  link: string;
  onCopy: () => void;
}) {
  if (!open) return null;
  const handlePick = (t: Target) => {
    const href = t.href(text, link);
    // Open in a new tab/window so the user stays in the app
    try {
      window.open(href, "_blank", "noopener,noreferrer");
    } catch {
      window.location.href = href;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-label="Choose an app to share with"
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-card border-t border-border p-5 pb-8 animate-in slide-in-from-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-foreground">Share invite via</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full hover:bg-secondary"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {TARGETS.map((t) => (
            <button
              key={t.id}
              onClick={() => handlePick(t)}
              className="flex flex-col items-center gap-2 active:scale-95 transition"
            >
              <div className={`w-14 h-14 rounded-2xl ${t.bg} flex items-center justify-center shadow-md`}>
                {t.icon}
              </div>
              <span className="text-xs text-foreground font-medium">{t.label}</span>
            </button>
          ))}

          <button
            onClick={() => {
              onCopy();
              onClose();
            }}
            className="flex flex-col items-center gap-2 active:scale-95 transition"
          >
            <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center">
              <Copy className="w-6 h-6 text-foreground" />
            </div>
            <span className="text-xs text-foreground font-medium">Copy link</span>
          </button>
        </div>

        <p className="mt-5 text-xs text-muted-foreground text-center leading-relaxed">
          On the installed Chichat app, your phone's full system share sheet will open instead.
        </p>
      </div>
    </div>
  );
}

export { MessageCircle };
