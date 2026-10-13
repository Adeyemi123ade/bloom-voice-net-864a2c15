import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Cloud, Loader2 } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
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
import {
  getMyBackup,
  runBackup,
  runRestore,
  setAutoBackup,
  hasNewChangesSinceBackup,
  type BackupRow,
} from "@/lib/chatBackup";
import { useBackNavigation } from "@/hooks/useBackNavigation";

function bytesLabel(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function friendly(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  return raw
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim() || "Please try again.";
}

export default function ChatBackup() {
  const navigate = useNavigate();
  const { showBackArrow, goBack } = useBackNavigation("/settings");
  const { user, loading } = useAuth();
  const [backup, setBackup] = useState<BackupRow | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  useEffect(() => {
    document.title = "Chat backup — Chichat";
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => setBackup(await getMyBackup()))();
  }, [user]);

  const onBackup = async () => {
    if (!user) return;
    setBackingUp(true);
    try {
      const current = backup ?? (await getMyBackup());
      const hasChanges = await hasNewChangesSinceBackup(user.id, current?.last_backup_at ?? null);
      if (current && !hasChanges) {
        toast({ title: "Account is up to date" });
        setBackingUp(false);
        return;
      }
      const r = await runBackup();
      const fresh = await getMyBackup();
      setBackup(fresh);
      toast({
        title: "Account backed up successfully",
        description: `${r.message_count} messages saved (${bytesLabel(fresh?.total_bytes ?? 0)}). A reboot is recommended.`,
      });
    } catch (e) {
      toast({ title: "Backup failed", description: friendly(e), variant: "destructive" });
    } finally {
      setBackingUp(false);
    }
  };

  const onConfirmRestore = async () => {
    setRestoreOpen(false);
    setRestoring(true);
    try {
      const r = await runRestore();
      toast({ title: "Restore complete", description: `${r.restored} of ${r.total} messages restored.` });
    } catch (e) {
      toast({ title: "Restore failed", description: friendly(e), variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  const onToggleAuto = async (v: boolean) => {
    try {
      await setAutoBackup(v);
      setBackup((b) => (b ? { ...b, auto_backup_enabled: v } : b));
    } catch (e) {
      toast({ title: "Could not update setting", description: friendly(e), variant: "destructive" });
    }
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-2 pt-4 pb-3 flex items-center gap-2 border-b border-border sticky top-0 bg-background z-10">
          {showBackArrow && (
            <button
              onClick={goBack}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <h1 className={`text-lg font-bold text-foreground ${showBackArrow ? "" : "pl-2"}`}>Chat backup</h1>
        </div>

        <div className="flex-1 px-4 py-4 flex flex-col gap-4">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/40">
            <span className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
              <Cloud className="w-6 h-6 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">
                {backup
                  ? `Last backup ${new Date(backup.last_backup_at).toLocaleDateString()}`
                  : "No backup yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {backup
                  ? `${backup.message_count} messages · ${bytesLabel(backup.total_bytes)}`
                  : "Back up your chats to restore them later"}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-base font-semibold text-foreground">Auto-backup daily</p>
              <p className="text-sm text-muted-foreground">Keeps your chats safe automatically</p>
            </div>
            <Switch
              checked={backup?.auto_backup_enabled ?? true}
              onCheckedChange={onToggleAuto}
            />
          </div>

          {backingUp && (
            <div className="px-3 py-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <p className="text-sm font-semibold text-foreground">Backing up your chats…</p>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div className="h-full w-1/3 bg-primary animate-[indeterminate_1.4s_ease-in-out_infinite]" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Please don't close the app until this finishes.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={onBackup}
              disabled={backingUp}
              className="w-full h-12 rounded-md bg-primary text-primary-foreground text-base font-semibold disabled:opacity-60"
            >
              {backingUp ? "Backing up…" : "Back up now"}
            </button>
            <button
              onClick={() => setRestoreOpen(true)}
              disabled={restoring || !backup}
              className="w-full h-12 rounded-md border border-border bg-background text-base font-semibold disabled:opacity-50"
            >
              {restoring ? "Restoring…" : "Restore backup"}
            </button>
          </div>

          <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
            <AlertDialogContent className="max-w-[320px]">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base">
                  Restore chats from your latest backup?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm">
                  This will pull in your most recent saved chats. Existing messages
                  on this device won't be removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-sm h-10">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onConfirmRestore} className="text-sm h-10">
                  OK
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </MobileFrame>
  );
}
