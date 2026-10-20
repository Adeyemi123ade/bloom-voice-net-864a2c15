import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { blockUser, REPORT_REASONS, submitReport, unblockUser, type ReportReason } from "@/lib/safety";

/** "Block <name>?" / "Unblock <name>?" confirmation. */
export function BlockDialog({
  open,
  onOpenChange,
  userId,
  name,
  blocked,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  name: string;
  blocked: boolean;
  onDone?: (nowBlocked: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { t } = useLanguage();

  const confirm = async () => {
    setBusy(true);
    const ok = blocked ? await unblockUser(userId) : await blockUser(userId);
    setBusy(false);
    onOpenChange(false);
    if (ok) {
      toast({ title: blocked ? `${name} unblocked` : `${name} blocked` });
      onDone?.(!blocked);
    } else {
      toast({ title: t("safety.failed") });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{blocked ? t("safety.unblockQ", { name }) : t("safety.blockQ", { name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {blocked
              ? t("safety.unblockBody")
              : t("safety.blockBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {blocked ? t("chat.unblock") : t("chat.block")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Report a person, or one of their messages. */
export function ReportDialog({
  open,
  onOpenChange,
  userId,
  name,
  conversationId,
  messageId,
  alreadyBlocked,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  name: string;
  conversationId?: string | null;
  messageId?: string | null;
  alreadyBlocked?: boolean;
  onDone?: (blocked: boolean) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (open) {
      setReason(null);
      setDetails("");
      setAlsoBlock(!alreadyBlocked);
    }
  }, [open, alreadyBlocked]);

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    const block = alsoBlock && !alreadyBlocked;
    const ok = await submitReport({
      reportedUserId: userId,
      conversationId,
      messageId,
      reason,
      details,
      alsoBlock: block,
    });
    setBusy(false);
    if (ok) {
      onOpenChange(false);
      toast({
        title: t("safety.thanks"),
        description: block ? t("safety.reviewBlocked", { name }) : t("safety.review"),
      });
      onDone?.(block);
    } else {
      toast({ title: t("safety.reportFailed") });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{messageId ? t("safety.reportMessage") : t("info.reportName", { name })}</DialogTitle>
          <DialogDescription>
            {messageId
              ? t("safety.reportMsgBody", { name })
              : t("safety.reportPersonBody", { name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2" role="radiogroup" aria-label={t("safety.reason")}>
          {REPORT_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={reason === r.id}
              onClick={() => setReason(r.id)}
              className={`w-full text-left px-3 py-3 rounded-xl border text-sm transition-colors ${
                reason === r.id ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-foreground"
              }`}
            >
              {t(r.labelKey)}
            </button>
          ))}
        </div>

        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
          placeholder={t("safety.anythingElse")}
          rows={3}
        />

        {!alreadyBlocked && (
          <label className="flex items-center gap-3 text-sm text-foreground">
            <Checkbox checked={alsoBlock} onCheckedChange={(v) => setAlsoBlock(v === true)} />
            {t("safety.alsoBlock", { name })}
          </label>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!reason || busy} onClick={() => void send()}>
            {busy ? t("safety.sending") : t("chat.report")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
