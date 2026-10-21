import type React from "react";
import { Mic, Paperclip, Pencil, X } from "lucide-react";
import { FILE_PREFIX, parseFileMessage } from "@/components/chat/AttachmentBubble";
import { VOICE_PREFIX } from "@/lib/chat/format";
import { mediaLabel, messageKind } from "@/lib/chat/messageKinds";
import { mediaUrlOf } from "@/lib/chat/clipboard";
import { useSignedMediaUrl } from "@/lib/signedMedia";
import { useLanguage } from "@/lib/i18n/context";
import type { Message, Profile } from "@/lib/chat/chatRoomData";

/** Strips above the message box: editing, replying, a picked file, a pasted voice note or file. */
export interface ComposerBannersProps {
  editing: Message | null;
  cancelEdit: () => void;
  replyTo: Message | null;
  user: { id: string } | null;
  other: Profile | null;
  cancelReply: () => void;
  pendingFile: { file: File; previewUrl: string } | null;
  cancelPending: () => void;
  uploading: boolean;
  pendingClip: string | null;
  cancelClip: () => void;
}

export default function ComposerBanners({
  editing,
  cancelEdit,
  replyTo,
  user,
  other,
  cancelReply,
  pendingFile,
  cancelPending,
  uploading,
  pendingClip,
  cancelClip,
}: ComposerBannersProps) {
  const { t } = useLanguage();
  return (
    <>
      {/* Editing banner */}
      {editing && (
        <div
          className="px-3 py-1.5 bg-secondary border-t border-border flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Pencil className="w-3 h-3 text-primary" />
          <span className="text-2xs text-muted-foreground flex-1 truncate">
            Editing: {editing.content}
          </span>
          <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Reply preview banner (WhatsApp-style) */}
      {replyTo && !editing && (
        <div
          className="px-3 py-2 bg-secondary border-t border-border flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-1 self-stretch rounded bg-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-2xs font-semibold text-primary">
              {t("chat.replyingTo", { name: replyTo.sender_id === user?.id ? t("chat.yourself") : other?.display_name ?? t("chat.them") })}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {replyTo.content.startsWith(VOICE_PREFIX)
                ? `🎤 ${t("msg.voiceNote")}`
                : replyTo.content.startsWith(FILE_PREFIX)
                  ? `📎 ${parseFileMessage(replyTo.content)?.name ?? t("msg.attachment")}`
                  : replyTo.content}
            </p>
          </div>
          <button onClick={cancelReply} aria-label={t("chat.cancelReply")} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending attachment preview (shown above composer) */}
      {pendingFile && (
        <div
          className="px-3 py-2 bg-secondary/60 border-t border-border flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-background flex items-center justify-center flex-shrink-0">
            {pendingFile.file.type.startsWith("image/") ? (
              <img
                src={pendingFile.previewUrl}
                alt={pendingFile.file.name}
                className="w-full h-full object-cover"
              />
            ) : pendingFile.file.type.startsWith("video/") ? (
              <video src={pendingFile.previewUrl} className="w-full h-full object-cover" />
            ) : (
              <Paperclip className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-foreground truncate">
              {pendingFile.file.name}
            </p>
            <p className="text-2xs text-muted-foreground">
              {(pendingFile.file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            onClick={cancelPending}
            aria-label={t("chat.removeAttachment")}
            className="w-7 h-7 rounded-full hover:bg-background flex items-center justify-center text-muted-foreground"
            disabled={uploading}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pasted voice note / photo / video / document (from an in-app copy) */}
      {pendingClip && !pendingFile && (
        <div
          className="px-3 py-2 bg-secondary/60 border-t border-border flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <PastedClipPreview content={pendingClip} />
          <button
            onClick={cancelClip}
            aria-label={t("chat.removePasted")}
            className="w-7 h-7 rounded-full hover:bg-background flex items-center justify-center text-muted-foreground"
            disabled={uploading}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}

function PastedClipPreview({ content }: { content: string }) {
  const kind = messageKind(content);
  const meta = parseFileMessage(content);
  const url = useSignedMediaUrl(kind === "image" || kind === "video" ? mediaUrlOf(content) : null);
  const { t } = useLanguage();
  const title = kind === "voice" ? t("msg.voiceNote") : meta?.name ?? mediaLabel(content);
  const sub = kind === "voice" ? t("chat.pastedVoice") : kind === "image" ? t("chat.pastedPhoto") : kind === "video" ? t("chat.pastedVideo") : t("chat.pastedDoc");
  return (
    <>
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-background flex items-center justify-center flex-shrink-0">
        {kind === "image" && url ? (
          <img src={url} alt={title} className="w-full h-full object-cover" />
        ) : kind === "video" && url ? (
          <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
        ) : kind === "voice" ? (
          <Mic className="w-5 h-5 text-primary" />
        ) : (
          <Paperclip className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-foreground truncate">{title}</p>
        <p className="text-2xs text-muted-foreground">{sub}</p>
      </div>
    </>
  );
}
