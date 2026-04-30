import { MessageSquare, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLongPress } from "@/hooks/useLongPress";
import { ActiveContact, InviteContact, initials } from "./contactsHelpers";

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-10 px-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

/** A row for a contact already on Chichat. Tap row OR icon → open chat. */
export function ActiveRow({
  c,
  onChat,
  onLongPress,
}: {
  c: ActiveContact;
  onChat: () => void;
  onLongPress: () => void;
}) {
  const lp = useLongPress(onLongPress);
  return (
    <div
      {...lp}
      onClick={onChat}
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 select-none cursor-pointer"
    >
      <Avatar className="w-11 h-11">
        <AvatarImage src={c.avatar_url ?? undefined} />
        <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
          {initials(c.display_name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-foreground truncate">
            {c.display_name}
          </p>
          {c.call_count >= 3 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-semibold">
              Frequent
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">Hello there!</p>
      </div>
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onChat();
        }}
        aria-label={`Message ${c.display_name}`}
        variant="ghost"
        className="h-10 w-10 p-0 text-primary hover:text-primary hover:bg-primary/10 rounded-full"
      >
        <MessageSquare className="w-5 h-5" />
      </Button>
    </div>
  );
}

/** A row for a contact NOT on Chichat. Tap "Invite" → native share sheet. */
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
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 select-none cursor-pointer"
    >
      <Avatar className="w-11 h-11">
        <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
          {initials(c.name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
      </div>
      {isManual && (
        <button
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-background mr-1"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onInvite();
        }}
        className={
          c.invited
            ? "text-sm font-semibold text-muted-foreground px-2"
            : "text-sm font-bold text-primary hover:text-primary/80 px-2"
        }
      >
        {c.invited ? "Sent" : "Invite"}
      </button>
    </div>
  );
}
