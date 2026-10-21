import type React from "react";
import ForwardSheet, { type ForwardResult } from "@/components/chat/ForwardSheet";
import CallBackSheet from "@/components/call/CallBackSheet";
import ContactInfoSheet from "@/components/chat/ContactInfoSheet";
import { BlockDialog, ReportDialog } from "@/components/chat/SafetyDialogs";
import type { selectionActions } from "@/lib/chat/messageKinds";
import { useLanguage } from "@/lib/i18n/context";
import type { Message, Profile } from "@/lib/chat/chatRoomData";

/** Forward, delete, call back, clear chat, block, report and contact info. */
export interface ChatRoomDialogsProps {
  forwardOpen: boolean;
  user: { id: string } | null;
  forwardContents: string[];
  setForwardOpen: React.Dispatch<React.SetStateAction<boolean>>;
  finishForward: (r: ForwardResult) => void;
  deleteOpen: boolean;
  setDeleteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  actions: ReturnType<typeof selectionActions>;
  deleteForEveryone: (msgs: Message[]) => Promise<void>;
  selectedList: Message[];
  deleteForMe: (msgs: Message[]) => void;
  callSheet: "voice" | "video" | null;
  setCallSheet: React.Dispatch<React.SetStateAction<"voice" | "video" | null>>;
  other: Profile | null;
  startCall: (type: "voice" | "video") => void;
  clearChatOpen: boolean;
  setClearChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  clearChat: () => Promise<void>;
  blockOpen: boolean;
  setBlockOpen: React.Dispatch<React.SetStateAction<boolean>>;
  otherName: string;
  blockedByMe: boolean;
  report: { messageId: string | null } | null;
  setReport: React.Dispatch<React.SetStateAction<{ messageId: string | null } | null>>;
  conversationId: string | undefined;
  contactInfoOpen: boolean;
  setContactInfoOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function ChatRoomDialogs({
  forwardOpen,
  user,
  forwardContents,
  setForwardOpen,
  finishForward,
  deleteOpen,
  setDeleteOpen,
  actions,
  deleteForEveryone,
  selectedList,
  deleteForMe,
  callSheet,
  setCallSheet,
  other,
  startCall,
  clearChatOpen,
  setClearChatOpen,
  clearChat,
  blockOpen,
  setBlockOpen,
  otherName,
  blockedByMe,
  report,
  setReport,
  conversationId,
  contactInfoOpen,
  setContactInfoOpen,
}: ChatRoomDialogsProps) {
  const { t } = useLanguage();
  return (
    <>
      {forwardOpen && user && (
        <ForwardSheet
          userId={user.id}
          contents={forwardContents}
          onClose={() => setForwardOpen(false)}
          onDone={finishForward}
        />
      )}
      {deleteOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/30"
            onClick={() => setDeleteOpen(false)}
          />
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[61] w-[260px] rounded-xl bg-background border border-border shadow-lg overflow-hidden">
            {actions.canDeleteForEveryone && (
              <button
                onClick={async () => {
                  setDeleteOpen(false);
                  await deleteForEveryone(selectedList);
                }}
                className="w-full h-11 text-sm text-foreground hover:bg-secondary border-b border-border"
              >
                {t("chat.deleteEveryone")}
              </button>
            )}
            <button
              onClick={() => {
                setDeleteOpen(false);
                deleteForMe(selectedList);
              }}
              className="w-full h-11 text-sm text-foreground hover:bg-secondary border-b border-border"
            >
              {t("chat.deleteMe")}
            </button>
            <button
              onClick={() => setDeleteOpen(false)}
              className="w-full h-11 text-sm text-foreground hover:bg-secondary"
            >
              {t("common.cancel")}
            </button>
          </div>
        </>
      )}
      <CallBackSheet
        open={!!callSheet}
        onOpenChange={(o) => !o && setCallSheet(null)}
        name={other?.display_name ?? t("chat.contact")}
        type={callSheet ?? "voice"}
        onConfirm={() => callSheet && startCall(callSheet)}
      />
      {clearChatOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/30"
            onClick={() => setClearChatOpen(false)}
          />
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[61] w-[280px] rounded-xl bg-background border border-border shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">{t("chat.clearTitle")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("chat.clearBody", { name: other?.display_name ?? t("chat.otherPerson") })}
              </p>
            </div>
            <button
              onClick={clearChat}
              className="w-full h-11 text-sm text-destructive hover:bg-secondary border-b border-border"
            >
              {t("chat.clearChat")}
            </button>
            <button
              onClick={() => setClearChatOpen(false)}
              className="w-full h-11 text-sm text-foreground hover:bg-secondary"
            >
              {t("common.cancel")}
            </button>
          </div>
        </>
      )}
      {other && (
        <BlockDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          userId={other.id}
          name={otherName}
          blocked={blockedByMe}
        />
      )}
      {other && (
        <ReportDialog
          open={!!report}
          onOpenChange={(o) => !o && setReport(null)}
          userId={other.id}
          name={otherName}
          conversationId={conversationId}
          messageId={report?.messageId ?? null}
          alreadyBlocked={blockedByMe}
        />
      )}
      <ContactInfoSheet
        open={contactInfoOpen}
        onOpenChange={setContactInfoOpen}
        contact={other}
        blocked={blockedByMe}
        onBlock={() => {
          setContactInfoOpen(false);
          setBlockOpen(true);
        }}
        onReport={() => {
          setContactInfoOpen(false);
          setReport({ messageId: null });
        }}
      />
    </>
  );
}
