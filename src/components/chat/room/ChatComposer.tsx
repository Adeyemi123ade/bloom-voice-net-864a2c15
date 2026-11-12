import type React from "react";
import { Loader2, Mic, Paperclip, Send, Smile, Type, X } from "lucide-react";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";
import type { EmojiClickData } from "emoji-picker-react";
import { VoiceRecorderBar } from "@/components/chat/VoiceRecorderBar";
import { acceptChat } from "@/lib/safety";
import { isVoiceTranscribeEnabled } from "@/lib/transcriptionPrefs";
import { fmtDuration } from "@/lib/chat/format";
import { messageKind } from "@/lib/chat/messageKinds";
import { useLanguage } from "@/lib/i18n/context";
import type { Message, Profile } from "@/lib/chat/chatRoomData";

/**
 * Bottom of the chat: the message box with attach, emoji, send and voice
 * note controls, or the removed account line, the blocked bar, or the
 * message request bar; and the
 * emoji panel under it.
 */
export interface ChatComposerProps {
  blockedByMe: boolean;
  /** The other person's account was removed by ChiChat. */
  otherRemoved?: boolean;
  other: Profile | null;
  otherName: string;
  setBlockOpen: React.Dispatch<React.SetStateAction<boolean>>;
  requestState: "checking" | "yes" | "no";
  setReport: React.Dispatch<React.SetStateAction<{ messageId: string | null } | null>>;
  setRequest: (v: "checking" | "yes" | "no") => void;
  conversationId: string | undefined;
  markConversationRead: () => Promise<void>;
  transcribing: boolean;
  recording: boolean;
  stopRecording: (mode?: "send" | "cancel" | "transcribe") => void;
  recSec: number;
  recStreamRef: React.MutableRefObject<MediaStream | null>;
  fileRef: React.RefObject<HTMLInputElement>;
  onPickFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pendingFile: { file: File; previewUrl: string } | null;
  pendingClip: string | null;
  composerInputRef: React.RefObject<HTMLTextAreaElement>;
  text: string;
  onComposerChange: (value: string) => void;
  onComposerPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  setEmojiOpen: React.Dispatch<React.SetStateAction<boolean>>;
  enterAddsNewLine: boolean;
  sendPending: () => void;
  sendClip: () => Promise<void>;
  send: () => void;
  editing: Message | null;
  uploading: boolean;
  startRecording: () => void;
  emojiOpen: boolean;
  onEmojiClick: (data: EmojiClickData) => void;
  resolvedTheme: string | undefined;
}

export default function ChatComposer({
  blockedByMe,
  otherRemoved = false,
  other,
  otherName,
  setBlockOpen,
  requestState,
  setReport,
  setRequest,
  conversationId,
  markConversationRead,
  transcribing,
  recording,
  stopRecording,
  recSec,
  recStreamRef,
  fileRef,
  onPickFile,
  pendingFile,
  pendingClip,
  composerInputRef,
  text,
  onComposerChange,
  onComposerPaste,
  setEmojiOpen,
  enterAddsNewLine,
  sendPending,
  sendClip,
  send,
  editing,
  uploading,
  startRecording,
  emojiOpen,
  onEmojiClick,
  resolvedTheme,
}: ChatComposerProps) {
  const { t } = useLanguage();
  return (
    <>
      {otherRemoved && other ? (
        <div className="px-4 pt-3 pb-5 border-t border-border bg-background text-center">
          <p className="text-sm text-muted-foreground">{t("chat.accountGone")}</p>
        </div>
      ) : blockedByMe && other ? (
        <div
          className="px-4 pt-3 pb-5 border-t border-border bg-background text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-muted-foreground">
            {t("chat.youBlocked", { name: otherName })}
          </p>
          <button
            onClick={() => setBlockOpen(true)}
            className="mt-2 text-sm font-semibold text-primary"
          >
            {t("chat.unblock")}
          </button>
        </div>
      ) : requestState === "yes" && other ? (
        <div
          className="px-4 pt-3 pb-5 border-t border-border bg-background"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-foreground text-center">
            {t("chat.notInContacts", { name: otherName })}
          </p>
          <p className="text-xs text-muted-foreground text-center mt-1">
            {t("chat.wontKnowSeen")}
          </p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button
              onClick={() => setBlockOpen(true)}
              className="h-11 rounded-xl border border-border text-sm font-medium text-destructive"
            >
              {t("chat.block")}
            </button>
            <button
              onClick={() => setReport({ messageId: null })}
              className="h-11 rounded-xl border border-border text-sm font-medium text-foreground"
            >
              {t("chat.report")}
            </button>
            <button
              onClick={() => {
                setRequest("no");
                void acceptChat(conversationId!);
                void markConversationRead();
              }}
              className="h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
            >
              {t("chat.accept")}
            </button>
          </div>
        </div>
      ) : (
      <div
        className="px-3 pt-2 pb-4 border-t border-border flex items-end gap-2 bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        {transcribing ? (
          <div className="flex-1 flex items-center gap-2 px-3 h-9 rounded-md bg-input border border-border">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <span className="text-xs text-muted-foreground">{t("chat.transcribing")}</span>
          </div>
        ) : recording ? (
          <>
            <button
              onClick={() => stopRecording("cancel")}
              aria-label={t("chat.cancelRecording")}
              className="w-9 h-9 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
            <div className="flex-1 flex items-center gap-2 px-2 h-9 rounded-md bg-input border border-border overflow-hidden">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse shrink-0" />
              <span className="text-xs text-foreground shrink-0 tabular-nums">{fmtDuration(recSec)}</span>
              <VoiceRecorderBar stream={recStreamRef.current} />
            </div>
            {isVoiceTranscribeEnabled() && (
              <button
                onClick={() => stopRecording("transcribe")}
                aria-label={t("chat.convertText")}
                title={t("chat.convertText")}
                className="w-9 h-9 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center"
              >
                <Type className="w-4 h-4 text-foreground" />
              </button>
            )}
            <button
              onClick={() => stopRecording("send")}
              aria-label={t("chat.sendVoice")}
              className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center"
            >
              <Send className="w-4 h-4 text-primary-foreground" />
            </button>
          </>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="*/*"
              className="hidden"
              onChange={onPickFile}
            />
            {!pendingFile && !pendingClip && (
              <button
                onClick={() => fileRef.current?.click()}
                aria-label={t("chat.attachFile")}
                className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center"
              >
                <Paperclip className="w-4 h-4 text-foreground" />
              </button>
            )}
            <textarea
              dir="auto"
              ref={composerInputRef}
              rows={1}
              value={text}
              onChange={(e) => onComposerChange(e.target.value)}
              onPaste={onComposerPaste}
              onFocus={() => setEmojiOpen(false)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey || enterAddsNewLine) return;
                // Don't send while an input method (e.g. predictive text) is composing.
                if (e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (pendingFile) sendPending();
                else if (pendingClip) void sendClip();
                else send();
              }}
              placeholder={
                pendingFile || (pendingClip && messageKind(pendingClip) !== "voice")
                  ? t("chat.captionPh")
                  : editing
                    ? t("chat.editMessage")
                    : t("chat.typeMessage")
              }
              disabled={uploading}
              aria-label={t("chat.message")}
              className="flex-1 min-w-0 min-h-10 resize-none rounded-lg border-[1.5px] border-border bg-input px-3.5 py-[7px] text-base leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary disabled:opacity-50"
            />
            {!pendingFile && (
              <button
                onClick={() => {
                  composerInputRef.current?.blur();
                  setEmojiOpen((v) => !v);
                }}
                aria-label={t("chat.emoji")}
                className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center"
              >
                <Smile className="w-4 h-4 text-foreground" />
              </button>
            )}
            {pendingFile || pendingClip ? (
              <button
                onClick={() => (pendingFile ? sendPending() : void sendClip())}
                aria-label={t("chat.sendAttachment")}
                disabled={uploading}
                className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center disabled:opacity-50"
              >
                <Send className="w-4 h-4 text-primary-foreground" />
              </button>
            ) : text.trim() || editing ? (
              <button
                onClick={send}
                aria-label={t("chat.send")}
                className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center disabled:opacity-50"
                disabled={!text.trim()}
              >
                <Send className="w-4 h-4 text-primary-foreground" />
              </button>
            ) : (
              <button
                onClick={startRecording}
                aria-label={t("chat.recordVoice")}
                className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center"
              >
                <Mic className="w-4 h-4 text-primary-foreground" />
              </button>
            )}
          </>
        )}
      </div>
      )}
      {emojiOpen && (
        <div className="border-t border-border bg-background h-[300px] overflow-hidden shrink-0">
          <EmojiPicker
            onEmojiClick={onEmojiClick}
            theme={resolvedTheme === "dark" ? EmojiTheme.DARK : EmojiTheme.LIGHT}
            width="100%"
            height={300}
            searchDisabled
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}
    </>
  );
}
