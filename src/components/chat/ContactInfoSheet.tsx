import { useLanguage } from "@/lib/i18n/context";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { loadCachedContacts, loadManualContacts } from "@/lib/deviceContacts";
import { loadMatchCache } from "@/lib/contactMatchCache";
import { formatDisplay } from "@/lib/phone";
import { initials, timeAgo } from "@/lib/chat/format";
import { Ban, Flag } from "lucide-react";

type Contact = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string;
  show_last_seen?: boolean | null;
} | null;

export default function ContactInfoSheet({
  open,
  onOpenChange,
  contact,
  blocked,
  onBlock,
  onReport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
  blocked?: boolean;
  onBlock?: () => void;
  onReport?: () => void;
}) {
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();

  // The app deliberately hides other users' phone numbers at the database
  // level (profiles.phone SELECT is revoked for everyone but the owner) —
  // the only legitimate way to know someone's number is if they're already
  // saved in your own device/Google contacts, same rule the rest of the app
  // follows. Re-run the same matching Contacts.tsx does, scoped to this one
  // contact, instead of exposing a new "look up anyone's number" endpoint.
  useEffect(() => {
    if (!open || !contact) { setPhone(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // The Contacts screen's last check already knows most numbers, so the
        // whole phone book isn't sent again every time this sheet opens.
        const { data: auth } = await supabase.auth.getSession();
        const me = auth.session?.user.id;
        const known = me ? loadMatchCache(me)?.matches.find((m) => m.user_id === contact.id) : undefined;
        if (known) { if (!cancelled) setPhone(known.phone); return; }
        const local = [...(loadCachedContacts() ?? []), ...loadManualContacts()];
        const phones = Array.from(new Set(local.flatMap((c) => c.phones).filter(Boolean)));
        if (phones.length === 0) { setPhone(null); return; }
        const { data } = await supabase.rpc("match_contacts_by_phone", { _phones: phones });
        if (cancelled) return;
        const match = (data ?? []).find((m: { user_id: string; phone: string }) => m.user_id === contact.id);
        setPhone(match?.phone ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, contact]);

  if (!contact) return null;

  const online = contact.is_online && contact.show_last_seen !== false;
  // No last seen when it's hidden or unknown (e.g. this person blocked you).
  const hasLastSeen = contact.show_last_seen !== false && new Date(contact.last_seen_at).getTime() > 0;
  const name = contact.display_name ?? "this person";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm bg-background border-border overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">{t("info.title")}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col items-center pt-4 pb-6">
          <Avatar className="w-24 h-24">
            <AvatarImage src={contact.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-foreground text-2xl font-semibold">
              {initials(contact.display_name)}
            </AvatarFallback>
          </Avatar>
          <p className="text-lg font-semibold text-foreground mt-3">
            {contact.display_name ?? t("chat.chichatUser")}
          </p>
          {(online || hasLastSeen) && (
            <p className="text-xs text-muted-foreground mt-1">
              {online ? t("common.online") : t("presence.lastSeen", { time: timeAgo(contact.last_seen_at) })}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <div className="px-3 py-3 rounded-lg bg-card">
            <p className="text-2xs uppercase tracking-wider text-muted-foreground mb-1">{t("info.phone")}</p>
            <p className="text-sm text-foreground">
              {loading ? t("reg.checking") : phone ? formatDisplay(phone) : t("info.notInContacts")}
            </p>
            {!loading && !phone && (
              <p className="text-2xs text-muted-foreground mt-1">
                {t("info.saveHint")}
              </p>
            )}
          </div>
        </div>

        {(onBlock || onReport) && (
          <div className="mt-6 space-y-1">
            {onBlock && (
              <button
                onClick={onBlock}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-card text-sm text-destructive"
              >
                <Ban className="w-4 h-4" /> {blocked ? t("info.unblockName", { name }) : t("info.blockName", { name })}
              </button>
            )}
            {onReport && (
              <button
                onClick={onReport}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-card text-sm text-destructive"
              >
                <Flag className="w-4 h-4" /> {t("info.reportName", { name })}
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
