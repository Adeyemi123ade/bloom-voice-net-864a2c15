import type React from "react";
import { Copy, Flag, Forward, Pencil, Share2, Trash2, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/context";
import type { selectionActions } from "@/lib/chat/messageKinds";
import type { Message } from "@/lib/chat/chatRoomData";

/** Action bar shown while messages are selected (copy, share, forward, report, edit, delete). */
export interface SelectionBarProps {
  clearSelection: () => void;
  selectionCount: number;
  actions: ReturnType<typeof selectionActions>;
  copyMsgs: (msgs: Message[]) => void;
  actionable: Message[];
  shareMsgs: (msgs: Message[]) => void;
  forwardContents: string[];
  setForwardOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onlySelected: Message | null;
  setReport: React.Dispatch<React.SetStateAction<{ messageId: string | null } | null>>;
  startEdit: (m: Message) => void;
  setDeleteOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function SelectionBar({
  clearSelection,
  selectionCount,
  actions,
  copyMsgs,
  actionable,
  shareMsgs,
  forwardContents,
  setForwardOpen,
  onlySelected,
  setReport,
  startEdit,
  setDeleteOpen,
}: SelectionBarProps) {
  const { t } = useLanguage();
  return (
    <div
      className="px-2 pt-4 pb-3 flex items-center gap-1 border-b border-border bg-card"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        aria-label={t("common.cancel")}
        onClick={clearSelection}
        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
      >
        <X className="w-4 h-4 text-foreground" />
      </button>
      <span className="text-xs font-semibold text-foreground ml-1">
        {selectionCount}
      </span>
      <div className="flex-1" />
      {actions.canCopy && (
        <button
          aria-label={t("chat.copy")}
          onClick={() => copyMsgs(actionable)}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
        >
          <Copy className="w-4 h-4 text-foreground" />
        </button>
      )}
      {actions.canShare && (
        <button
          aria-label={t("chat.share")}
          onClick={() => shareMsgs(actionable)}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
        >
          <Share2 className="w-4 h-4 text-foreground" />
        </button>
      )}
      {actions.canForward && forwardContents.length > 0 && (
        <button
          aria-label={t("chat.forward")}
          onClick={() => setForwardOpen(true)}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
        >
          <Forward className="w-4 h-4 text-foreground" />
        </button>
      )}
      {actions.canReport && onlySelected && (
        <button
          aria-label={t("chat.report")}
          onClick={() => {
            setReport({ messageId: onlySelected.id });
            clearSelection();
          }}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
        >
          <Flag className="w-4 h-4 text-foreground" />
        </button>
      )}
      {actions.canEdit && (
        <button
          aria-label={t("chat.edit")}
          onClick={() => onlySelected && startEdit(onlySelected)}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
        >
          <Pencil className="w-4 h-4 text-foreground" />
        </button>
      )}
      <button
        aria-label={t("chat.deleteSelected")}
        onClick={() => setDeleteOpen(true)}
        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
      >
        <Trash2 className="w-4 h-4 text-destructive" />
      </button>
    </div>
  );
}
