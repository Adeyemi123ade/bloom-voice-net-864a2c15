import React from "react";
import { Check, CheckCheck, ChevronsDown } from "lucide-react";
import { AttachmentBubble, FILE_PREFIX, parseFileMessage, isBareAttachment } from "@/components/chat/AttachmentBubble";
import { VoiceBubble } from "@/components/chat/VoiceBubble";
import { CallSystemBubble } from "@/components/chat/CallSystemBubble";
import { CallRow, SwipeRow } from "@/components/chat/MessageRows";
import { CALL_PREFIX, VOICE_PREFIX, formatTime } from "@/lib/chat/format";
import { parseCallLog } from "@/lib/chat/messageKinds";
import chatWallpaper from "@/assets/chat-wallpaper.png";
import { useLanguage } from "@/lib/i18n/context";
import type { Message } from "@/lib/chat/chatRoomData";
import { dayKey, dayLabel } from "@/lib/chat/dayLabels";
import { useChatScrollAids } from "@/components/chat/room/useChatScrollAids";

/** The scrolling list of messages (and call records) with the logo wallpaper behind it. */
export interface MessageListProps {
  scrollRef: React.RefObject<HTMLDivElement>;
  onMessagesScroll: () => void;
  loadingOlder: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchResults: Message[];
  visible: Message[];
  user: { id: string } | null;
  selectedIds: Set<string>;
  messageRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  highlightId: string | null;
  selectionCount: number;
  jumpToMessage: (id: string) => void;
  toggleSelect: (id: string) => void;
  setCallSheet: React.Dispatch<React.SetStateAction<"voice" | "video" | null>>;
  selectFromLongPress: (id: string) => void;
  replyMsg: (m: Message) => void;
  bubbleTapsBlocked: boolean;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setDeleteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  otherTyping: boolean;
}

export default function MessageList({
  scrollRef,
  onMessagesScroll,
  loadingOlder,
  searchOpen,
  searchQuery,
  searchResults,
  visible,
  user,
  selectedIds,
  messageRefs,
  highlightId,
  selectionCount,
  jumpToMessage,
  toggleSelect,
  setCallSheet,
  selectFromLongPress,
  replyMsg,
  bubbleTapsBlocked,
  setSelectedIds,
  setDeleteOpen,
  otherTyping,
}: MessageListProps) {
  const { t, language } = useLanguage();
  const rows = searchOpen && searchQuery.trim() ? searchResults : visible;
  const { activeDay, pillVisible, showJump, onScroll, jumpToLatest } = useChatScrollAids(scrollRef, rows);
  const labelFor = (key: string) =>
    // English dates as "13 October 2026" (day first), as in Nigeria and the UAE.
    dayLabel(key, { today: t("time.today"), yesterday: t("time.yesterday"), locale: language === "en" ? "en-GB" : language });
  // Rows are in time order; a date pill goes before the first row of each day.
  let prevDay = "";
  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
    <div
      ref={scrollRef}
      onScroll={() => {
        onMessagesScroll();
        onScroll();
      }}
      data-testid="chat-wallpaper"
      className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
      style={{ backgroundImage: `url(${chatWallpaper})`, backgroundSize: "176px 176px", backgroundRepeat: "repeat" }}
    >
      {loadingOlder && !searchOpen && (
        <p className="text-2xs text-muted-foreground text-center py-1" role="status">
          {t("chat.loadingEarlier")}
        </p>
      )}
      {searchOpen && searchQuery.trim() && searchResults.length === 0 && (
        <p className="text-xs text-muted-foreground text-center mt-6">{t("common.noMatches")}</p>
      )}
      {!searchOpen && visible.length === 0 && (
        <p className="text-xs text-muted-foreground text-center mt-6">{t("chat.sayHello")}</p>
      )}
      {rows.map((m) => {
        const day = dayKey(m.created_at);
        const newDay = day !== prevDay;
        prevDay = day;
        const separator = newDay ? (
          <div key={`day-${day}`} data-day={day} data-testid="day-separator" className="flex justify-center py-1">
            <span className="px-3 py-1 rounded-lg bg-card/95 text-muted-foreground text-xs font-medium shadow-sm">
              {labelFor(day)}
            </span>
          </div>
        ) : null;
        const mine = m.sender_id === user?.id;
        const isVoice = m.content.startsWith(VOICE_PREFIX);
        const isCall = m.content.startsWith(CALL_PREFIX);
        const isFile = m.content.startsWith(FILE_PREFIX);
        const voiceUrl = isVoice ? m.content.slice(VOICE_PREFIX.length) : "";
        const fileMeta = isFile ? parseFileMessage(m.content) : null;
        const isDeleted = m.deleted_for_everyone;
        const isSelected = selectedIds.has(m.id);

        if (isCall) {
          return (
            <React.Fragment key={m.id}>
            {separator}
            <div
              data-day={day}
              ref={(el) => {
                if (el) messageRefs.current.set(m.id, el);
                else messageRefs.current.delete(m.id);
              }}
              className={`transition-colors rounded-2xl ${highlightId === m.id ? "bg-accent/25" : ""}`}
            >
              <CallRow
                mine={mine}
                isSelected={isSelected}
                onTap={() => {
                  if (searchOpen) jumpToMessage(m.id);
                  else if (selectionCount > 0) toggleSelect(m.id);
                  // Outside selection mode a tap offers to call back,
                  // always behind a confirmation (never calls directly).
                  else setCallSheet(parseCallLog(m.content)?.callType ?? "voice");
                }}
                onLongPress={() => selectFromLongPress(m.id)}
              >
                <CallSystemBubble m={m} mine={mine} />
              </CallRow>
            </div>
            </React.Fragment>
          );
        }

        // Parse quoted reply prefix: lines starting with "> " followed by message
        let quoted: string | null = null;
        let body = m.content;
        if (!isVoice && !isFile && !isDeleted && body.startsWith("> ")) {
          const nl = body.indexOf("\n");
          if (nl > -1) {
            quoted = body.slice(2, nl);
            body = body.slice(nl + 1);
          }
        }

        const bareAttachment = isFile && fileMeta && isBareAttachment(fileMeta);

        return (
          <React.Fragment key={m.id}>
          {separator}
          <div
            data-day={day}
            ref={(el) => {
              if (el) messageRefs.current.set(m.id, el);
              else messageRefs.current.delete(m.id);
            }}
            className={`transition-colors rounded-2xl ${highlightId === m.id ? "bg-accent/25" : ""}`}
          >
          <SwipeRow
            mine={mine}
            onReply={() => replyMsg(m)}
            onTap={(e) => {
              e.stopPropagation();
              if (searchOpen) {
                jumpToMessage(m.id);
                return;
              }
              // In selection mode, tap toggles. Otherwise tap does nothing
              // (selection requires long-press to avoid accidental opens).
              if (selectionCount > 0) toggleSelect(m.id);
            }}
            onLongPress={() => selectFromLongPress(m.id)}
          >
            <div
              className={`max-w-[92%] select-none transition-shadow ${
                bubbleTapsBlocked ? "pointer-events-none" : ""
              } ${
                bareAttachment
                  ? `rounded-2xl ${isSelected ? "ring-2 ring-accent" : ""}`
                  : `px-4 py-2.5 rounded-2xl shadow-sm ${
                      mine
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card text-foreground rounded-bl-sm"
                    } ${isDeleted ? "italic opacity-70" : ""} ${
                      isSelected ? "ring-2 ring-accent" : ""
                    }`
              }`}
            >
              {quoted && !bareAttachment && (
                <div
                  dir="auto"
                  className={`mb-1 px-2 py-1 rounded-md border-l-2 text-xs line-clamp-4 whitespace-pre-wrap break-words ${
                    mine
                      ? "bg-primary-foreground/10 border-primary-foreground/60 text-primary-foreground/85"
                      : "bg-foreground/5 border-primary text-muted-foreground"
                  }`}
                >
                  {quoted}
                </div>
              )}
              {isDeleted ? (
                <p className="text-[12px]">🚫 {t("chat.deletedMsg")}</p>
              ) : isVoice ? (
                <VoiceBubble id={m.id} url={voiceUrl} mine={mine} />
              ) : isFile && fileMeta ? (
                <AttachmentBubble
                  meta={fileMeta}
                  mine={mine}
                  timestamp={m.created_at}
                  onDelete={() => {
                    setSelectedIds(new Set([m.id]));
                    setDeleteOpen(true);
                  }}
                />
              ) : (
                <p dir="auto" className="text-base whitespace-pre-wrap break-words leading-snug">
                  {body}
                  <span
                    className={`float-right inline-flex items-center gap-1 ml-2 mt-1 text-[10px] leading-none whitespace-nowrap ${
                      mine ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {m.edited_at && <span>{t("chat.edited")}</span>}
                    <span>{formatTime(m.created_at)}</span>
                    {mine && (
                      m.read_at ? (
                        <CheckCheck className="w-3 h-3 text-sky-400" />
                      ) : m.delivered_at ? (
                        <CheckCheck className="w-3 h-3 text-primary-foreground/70" />
                      ) : (
                        <Check className="w-3 h-3 text-primary-foreground/70" />
                      )
                    )}
                  </span>
                </p>
              )}
              {!bareAttachment && (isDeleted || isVoice || isFile) && (
                <div className={`flex items-center gap-1 mt-0.5 ${mine ? "justify-end" : "justify-start"}`}>
                  {m.edited_at && !isDeleted && (
                    <span className={`text-[9px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      edited
                    </span>
                  )}
                  <span className={`text-[9px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {formatTime(m.created_at)}
                  </span>
                  {mine && !isDeleted && (
                    m.read_at ? (
                      <CheckCheck className="w-3 h-3 text-sky-400" />
                    ) : m.delivered_at ? (
                      <CheckCheck className={`w-3 h-3 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`} />
                    ) : (
                      <Check className={`w-3 h-3 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`} />
                    )
                  )}
                </div>
              )}
            </div>
          </SwipeRow>
          </div>
          </React.Fragment>
        );
      })}
      {otherTyping && (
        <div className="flex justify-start">
          <div className="bg-card text-foreground px-3 py-2 rounded-2xl rounded-bl-sm shadow-sm">
            <div className="flex gap-1 items-center h-3">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Floating date while scrolling: the day of what is at the top of the
        view. Fades out shortly after scrolling stops; the date pills in the
        list stay. */}
    {activeDay && (
      <div
        aria-hidden="true"
        data-testid="floating-day"
        className={`pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 transition-opacity duration-300 ${
          pillVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="px-3 py-1 rounded-lg bg-card/95 text-muted-foreground text-xs font-medium shadow-sm">
          {labelFor(activeDay)}
        </span>
      </div>
    )}

    {/* Back to the newest message. */}
    {showJump && (
      <button
        type="button"
        onClick={jumpToLatest}
        aria-label={t("chat.toLatest")}
        title={t("chat.toLatest")}
        data-testid="jump-latest"
        className="absolute bottom-3 right-3 z-10 w-10 h-10 rounded-full bg-card text-muted-foreground shadow-md border border-border flex items-center justify-center active:scale-95 transition"
      >
        <ChevronsDown className="w-5 h-5" />
      </button>
    )}
    </div>
  );
}
