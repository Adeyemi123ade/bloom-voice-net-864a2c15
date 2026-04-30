import { Copy, MessageCircle, Share2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { APP_INVITE_LINK } from "./contactsHelpers";
import { isNativePlatform } from "@/lib/deviceContacts";

const SHARE_TEXT = `Hi! I'm inviting you to use Chichat — high-quality voice & video calls and messaging. Download here: ${APP_INVITE_LINK}`;

export function ShareInviteCard() {
  const link = APP_INVITE_LINK;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT}`);
      toast({ title: "Invite copied", description: "Paste it anywhere." });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  /** Native OS share sheet — lets the user pick WhatsApp, SMS, Gmail, etc. */
  const share = async () => {
    const shared = await openShareChooser(SHARE_TEXT, link);
    if (!shared) {
      await copy();
      toast({
        title: "Invite copied",
        description: "Your phone could not open the app chooser, so the invite is ready to paste.",
      });
    }
  };

  return (
    <div className="mx-4 rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      {/* Hero card — visual preview of what the invite looks like */}
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
  );
}

/** Programmatic invite trigger — used by the Contacts list "Invite" button. */
export async function shareChichatInvite(personalNote?: string) {
  const text = personalNote ? `${personalNote}\n\n${SHARE_TEXT}` : SHARE_TEXT;
  return openShareChooser(text, APP_INVITE_LINK);
}

async function openShareChooser(text: string, url: string) {
  if (isNativePlatform()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title: "Chichat",
        text,
        url,
        dialogTitle: "Send invite with",
      });
      return true;
    } catch {
      return false;
    }
  }

  const nav = navigator as Navigator & {
    share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  };
  if (nav.share) {
    try {
      await nav.share({ title: "Chichat", text, url });
      return true;
    } catch {
      /* user cancelled */
      return false;
    }
  }
  return false;
}

export { MessageCircle };
