import { useEffect, useState } from "react";
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

  const confirm = async () => {
    setBusy(true);
    const ok = blocked ? await unblockUser(userId) : await blockUser(userId);
    setBusy(false);
    onOpenChange(false);
    if (ok) {
      toast({ title: blocked ? `${name} unblocked` : `${name} blocked` });
      onDone?.(!blocked);
    } else {
      toast({ title: "That didn't work. Please try again." });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{blocked ? `Unblock ${name}?` : `Block ${name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {blocked
              ? "They'll be able to message and call you again."
              : "They won't be able to message or call you, or see your photo and last seen. They won't be told."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {blocked ? "Unblock" : "Block"}
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
        title: "Thanks for letting us know",
        description: block ? `We'll review this. ${name} is now blocked.` : "We'll review this.",
      });
      onDone?.(block);
    } else {
      toast({ title: "We couldn't send your report. Please try again." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{messageId ? "Report message" : `Report ${name}`}</DialogTitle>
          <DialogDescription>
            {messageId
              ? `This message from ${name} will be sent to ChiChat to review.`
              : `Tell us what's wrong. ${name} won't be told who reported them.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2" role="radiogroup" aria-label="Reason">
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
              {r.label}
            </button>
          ))}
        </div>

        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
          placeholder="Anything else we should know? (optional)"
          rows={3}
        />

        {!alreadyBlocked && (
          <label className="flex items-center gap-3 text-sm text-foreground">
            <Checkbox checked={alsoBlock} onCheckedChange={(v) => setAlsoBlock(v === true)} />
            Also block {name}
          </label>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!reason || busy} onClick={() => void send()}>
            {busy ? "Sending…" : "Report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
