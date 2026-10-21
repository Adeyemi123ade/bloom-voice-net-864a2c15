import type React from "react";
import { ArrowLeft, Ban, Flag, Info, MoreVertical, Phone, Search, Trash2, Video } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isReallyOnline } from "@/lib/presence";
import { initials } from "@/lib/chat/format";
import { useLanguage } from "@/lib/i18n/context";
import type { Profile } from "@/lib/chat/chatRoomData";

/** The chat's header: back, photo, name, typing / online, call buttons and the menu. */
export interface ChatHeaderProps {
  showBackArrow: boolean;
  goBack: () => void;
  other: Profile | null;
  otherTyping: boolean;
  startCall: (type: "voice" | "video") => void;
  setContactInfoOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setClearChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setBlockOpen: React.Dispatch<React.SetStateAction<boolean>>;
  blockedByMe: boolean;
  setReport: React.Dispatch<React.SetStateAction<{ messageId: string | null } | null>>;
}

export default function ChatHeader({
  showBackArrow,
  goBack,
  other,
  otherTyping,
  startCall,
  setContactInfoOpen,
  setSearchOpen,
  setClearChatOpen,
  setBlockOpen,
  blockedByMe,
  setReport,
}: ChatHeaderProps) {
  const { t } = useLanguage();
  return (
    <div className="px-3 pt-4 pb-3 flex items-center gap-2 border-b border-border">
      {showBackArrow && (
        <button
          aria-label={t("common.back")}
          onClick={(e) => { e.stopPropagation(); goBack(); }}
          className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center hover:bg-secondary shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
      )}
      <div className="relative">
        <Avatar className="w-9 h-9">
          <AvatarImage src={other?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">
            {initials(other?.display_name)}
          </AvatarFallback>
        </Avatar>
        {other && (() => {
          const ageMs = Date.now() - new Date(other.last_seen_at).getTime();
          return other.is_online && ageMs < 5 * 60 * 1000;
        })() && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent border-2 border-background" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">
          {other?.display_name ?? t("chat.chichatUser")}
        </p>
        {/* Fixed-height status row — never changes header height */}
        <div className="h-[14px] flex items-center">
          {otherTyping ? (
            <span className="text-xs text-primary truncate flex items-center gap-1">
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1 h-1 rounded-full bg-primary animate-bounce" />
              </span>
              typing
            </span>
          ) : isReallyOnline(other) ? (
            <span className="text-xs text-muted-foreground truncate">{t("common.online")}</span>
          ) : null}
        </div>
      </div>
      <button
        aria-label={t("call.voice")}
        onClick={(e) => { e.stopPropagation(); startCall("voice"); }}
        className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary active:bg-secondary active:scale-90 transition-transform"
      >
        <Phone className="w-5 h-5 text-foreground" />
      </button>
      <button
        aria-label={t("call.video")}
        onClick={(e) => { e.stopPropagation(); startCall("video"); }}
        className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary active:bg-secondary active:scale-90 transition-transform"
      >
        <Video className="w-5 h-5 text-foreground" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t("chat.moreOptions")}
            onClick={(e) => e.stopPropagation()}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
          >
            <MoreVertical className="w-5 h-5 text-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => setContactInfoOpen(true)}>
            <Info className="w-4 h-4 mr-2" /> {t("chat.viewContact")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSearchOpen(true)}>
            <Search className="w-4 h-4 mr-2" /> {t("chat.search")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setClearChatOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" /> {t("chat.clearChat")}
          </DropdownMenuItem>
          {other && (
            <>
              <DropdownMenuItem onClick={() => setBlockOpen(true)}>
                <Ban className="w-4 h-4 mr-2" /> {blockedByMe ? t("chat.unblock") : t("chat.block")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setReport({ messageId: null })}
                className="text-destructive focus:text-destructive"
              >
                <Flag className="w-4 h-4 mr-2" /> {t("chat.report")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
