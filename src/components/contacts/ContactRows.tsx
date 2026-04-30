import { MessageCircle, Phone, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLongPress } from "@/hooks/useLongPress";
import { formatDisplay } from "@/lib/phone";
import { ActiveContact, InviteContact, initials } from "./contactsHelpers";

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-10 px-4">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

export function ActiveRow({
  c,
  onCall,
  onLongPress,
}: {
  c: ActiveContact;
  onCall: () => void;
  onLongPress: () => void;
}) {
  // Tap the row body → open action sheet (Call / Chat / …). Tap the Call
  // button → call directly.
  const lp = useLongPress(onLongPress);
  return (
    <div
      {...lp}
      onClick={onLongPress}
      className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-secondary select-none cursor-pointer"
    >
      <Avatar className="w-10 h-10">
        <AvatarImage src={c.avatar_url ?? undefined} />
        <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">
          {initials(c.display_name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-foreground truncate">
            {c.display_name}
          </p>
          {c.call_count >= 3 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-semibold">
              Frequent · {c.call_count}
            </Badge>
          )}
        </div>
        <p className="text-2xs text-muted-foreground truncate">
          {formatDisplay(c.phone)}
        </p>
      </div>
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onCall();
        }}
        aria-label={`Call ${c.display_name}`}
        className="h-9 w-9 p-0 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full"
      >
        <Phone className="w-4 h-4" />
      </Button>
    </div>
  );
}

export function InviteRow({
  c,
  isManual,
  onInvite,
  onRemove,
  onLongPress,
}: {
  c: InviteContact;
  isManual: boolean;
  onInvite: () => void;
  onRemove: () => void;
  onLongPress: () => void;
}) {
  const lp = useLongPress(onLongPress);
  return (
    <div
      {...lp}
      onClick={onLongPress}
      className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-secondary select-none cursor-pointer"
    >
      <Avatar className="w-10 h-10">
        <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">
          {initials(c.name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
        <p className="text-2xs text-muted-foreground truncate">
          {formatDisplay(c.phone)}
        </p>
      </div>
      {isManual && (
        <button
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-background"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onInvite();
        }}
        variant={c.invited ? "outline" : "default"}
        className={
          c.invited
            ? "h-9 px-3 rounded-lg text-xs border-border"
            : "h-9 px-3 bg-[#25D366] hover:bg-[#1ebe5a] text-white rounded-lg text-xs"
        }
      >
        <MessageCircle className="w-3.5 h-3.5" />
        {c.invited ? "Sent" : "WhatsApp"}
      </Button>
    </div>
  );
}
