import { Copy, MessageCircle, Share2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { APP_INVITE_LINK } from "./contactsHelpers";

export function ShareInviteCard() {
  const link = APP_INVITE_LINK;
  const text = `Join me on Chichat — high-quality calls and messages: ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copied", description: "Paste it anywhere." });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  const share = async () => {
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ title: "Chichat", text, url: link });
        return;
      } catch {
        /* user cancelled — fall through */
      }
    }
    // Fallback: open WhatsApp web share.
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
  };

  const whatsapp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
  };

  return (
    <div className="mx-3 mt-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
      <div className="flex items-center gap-2">
        <Share2 className="w-4 h-4 text-primary" />
        <p className="text-xs font-semibold text-foreground">Invite anyone with a link</p>
      </div>
      <p className="text-2xs text-muted-foreground mt-1 truncate">{link}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button
          onClick={copy}
          className="h-9 rounded-md bg-secondary hover:bg-secondary/80 text-foreground text-2xs font-semibold inline-flex items-center justify-center gap-1"
        >
          <Copy className="w-3.5 h-3.5" />
          Copy
        </button>
        <button
          onClick={whatsapp}
          className="h-9 rounded-md bg-[#25D366] hover:bg-[#1ebe5a] text-white text-2xs font-semibold inline-flex items-center justify-center gap-1"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          WhatsApp
        </button>
        <button
          onClick={share}
          className="h-9 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-2xs font-semibold inline-flex items-center justify-center gap-1"
        >
          <Share2 className="w-3.5 h-3.5" />
          Share
        </button>
      </div>
    </div>
  );
}
