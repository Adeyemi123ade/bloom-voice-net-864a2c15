import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  Smartphone,
  Trash2,
  User as UserIcon,
  Cloud,
  Contact2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  startGoogleContactsConnect,
  completeGoogleContactsConnect,
  syncGoogleContacts,
} from "@/lib/googleContacts";
import {
  getMyBackup,
  runBackup,
  runRestore,
  setAutoBackup,
  hasNewChangesSinceBackup,
  type BackupRow,
} from "@/lib/chatBackup";
import { clearContactsCache } from "@/lib/deviceContacts";

function fileToDataUrl_unused() {}

function bytesLabel(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const [confirmStage, setConfirmStage] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [backup, setBackup] = useState<BackupRow | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  useEffect(() => {
    document.title = "Settings — Chichat";
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  // Load Google connection + backup row
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("google_oauth_tokens")
        .select("google_email")
        .maybeSingle();
      setGoogleEmail(data?.google_email ?? null);
      setBackup(await getMyBackup());
    })();
  }, [user]);

  // Handle Google OAuth redirect (?code=…)
  useEffect(() => {
    const code = params.get("code");
    if (!code || !user) return;
    (async () => {
      try {
        const r = await completeGoogleContactsConnect(code);
        setGoogleEmail(r.email);
        toast({ title: "Google connected", description: r.email ?? "Account linked." });
        setSyncing(true);
        const list = await syncGoogleContacts();
        toast({ title: "Contacts synced", description: `${list.length} contacts loaded.` });
      } catch (e) {
        toast({ title: "Google connect failed", description: friendly(e), variant: "destructive" });
      } finally {
        setSyncing(false);
        params.delete("code");
        params.delete("scope");
        params.delete("state");
        setParams(params, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const connectGoogle = async () => {
    setConnecting(true);
    try { await startGoogleContactsConnect(); }
    catch (e) {
      setConnecting(false);
      toast({ title: "Could not start Google sign-in", description: friendly(e), variant: "destructive" });
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const list = await syncGoogleContacts();
      toast({ title: "Contacts synced", description: `${list.length} contacts loaded.` });
    } catch (e) {
      toast({ title: "Sync failed", description: friendly(e), variant: "destructive" });
    } finally { setSyncing(false); }
  };

  const onBackup = async () => {
    if (!user) return;
    setBackingUp(true);
    try {
      // Fast client-side check for "up to date".
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
    } finally { setBackingUp(false); }
  };

  const onConfirmRestore = async () => {
    setRestoreOpen(false);
    setRestoring(true);
    try {
      const r = await runRestore();
      toast({ title: "Restore complete", description: `${r.restored} of ${r.total} messages restored.` });
    } catch (e) {
      toast({ title: "Restore failed", description: friendly(e), variant: "destructive" });
    } finally { setRestoring(false); }
  };

  const onToggleAuto = async (v: boolean) => {
    try {
      await setAutoBackup(v);
      setBackup((b) => (b ? { ...b, auto_backup_enabled: v } : b));
    } catch (e) {
      toast({ title: "Could not update setting", description: friendly(e), variant: "destructive" });
    }
  };

  const deleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      // Try to fully wipe the account server-side so a reinstall behaves as a
      // brand-new user (no "Deleted user" appearing in friends' contact lists).
      // The edge function deletes profile, backups, tokens, then auth.user.
      try {
        await supabase.functions.invoke("delete-account", {});
      } catch {
        // Fallback: at minimum remove identifying profile data.
        await supabase
          .from("profiles")
          .update({ display_name: null, avatar_url: null, phone: null, is_online: false })
          .eq("id", user.id);
      }
      await supabase.auth.signOut();
      // Wipe every local trace so reinstall feels fresh.
      try {
        clearContactsCache();
        localStorage.clear();
        sessionStorage.clear();
      } catch { /* ignore */ }
      toast({ title: "Account removed", description: "You have been signed out." });
      navigate("/register", { replace: true });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <MobileFrame bottomNav="settings">
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-4 pt-5 pb-4 border-b border-border sticky top-0 bg-background z-10">
          <h1 className="text-lg font-bold text-foreground">Settings</h1>
        </div>

        <div className="flex-1 px-4 py-4 flex flex-col gap-3">
          <button
            onClick={() => navigate("/profile")}
            className="w-full flex items-center gap-3 px-3 py-3.5 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">Profile setting</p>
              <p className="text-sm text-muted-foreground truncate">
                Edit name, photo and about
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          <button
            onClick={() => navigate("/settings/phone")}
            className="w-full flex items-center gap-3 px-3 py-3.5 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">Phone settings</p>
              <p className="text-sm text-muted-foreground truncate">
                Theme and ringtone
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Default new-contact photo */}
          <div className="px-3 py-3 rounded-lg bg-secondary/40">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onPickAvatar}
                className="relative w-14 h-14 rounded-xl border-2 border-dashed border-primary/50 bg-primary/10 hover:bg-primary/15 flex items-center justify-center overflow-hidden"
                aria-label="Choose default contact photo"
              >
                {defaultAvatar ? (
                  <img src={defaultAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="w-6 h-6 text-primary" />
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Camera className="w-3 h-3" />
                </span>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold">Default contact photo</p>
                <p className="text-sm text-muted-foreground truncate">
                  Used as the avatar when adding a new contact.
                </p>
              </div>
              {defaultAvatar && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  className="text-xs text-muted-foreground hover:text-destructive px-2 h-8"
                >
                  Remove
                </button>
              )}
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarFile}
              />
            </div>
          </div>

          {/* Connected accounts — Google */}
          <div className="px-3 py-3 rounded-lg bg-secondary/40">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                <Contact2 className="w-5 h-5 text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold">Google contacts</p>
                <p className="text-sm text-muted-foreground truncate">
                  {googleEmail ? `Connected as ${googleEmail}` : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {googleEmail ? (
                <button
                  onClick={syncNow}
                  disabled={syncing}
                  className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
              ) : (
                <button
                  onClick={connectGoogle}
                  disabled={connecting}
                  className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
                >
                  {connecting ? "Opening Google…" : "Connect Google"}
                </button>
              )}
            </div>
          </div>

          {/* Chat backup */}
          <div className="px-3 py-3 rounded-lg bg-secondary/40">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                <Cloud className="w-5 h-5 text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold">Chat backup</p>
                <p className="text-sm text-muted-foreground truncate">
                  {backup
                    ? `Last: ${new Date(backup.last_backup_at).toLocaleString()} · ${backup.message_count} msgs · ${bytesLabel(backup.total_bytes)}`
                    : "No backup yet"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-foreground">Auto-backup daily</span>
              <Switch
                checked={backup?.auto_backup_enabled ?? true}
                onCheckedChange={onToggleAuto}
              />
            </div>

            {backingUp && (
              <div className="mt-2 mb-2 px-3 py-3 rounded-lg bg-primary/10 border border-primary/30">
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

            <div className="flex gap-2 mt-1">
              <button
                onClick={onBackup}
                disabled={backingUp}
                className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
              >
                {backingUp ? "Backing up…" : "Back up now"}
              </button>
              <button
                onClick={() => setRestoreOpen(true)}
                disabled={restoring || !backup}
                className="flex-1 h-10 rounded-md border border-border bg-background text-sm font-semibold disabled:opacity-50"
              >
                {restoring ? "Restoring…" : "Restore"}
              </button>
            </div>

            {/* Clean restore confirmation — no embedded URL chrome. */}
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
                  <AlertDialogAction
                    onClick={onConfirmRestore}
                    className="text-sm h-10"
                  >
                    OK
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="flex-1" />

          <div className="pt-6 pb-2">
            <AlertDialog onOpenChange={(o) => !o && setConfirmStage(false)}>
              <AlertDialogTrigger asChild>
                <button className="w-full h-12 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm font-semibold flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Delete account
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[320px]">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-base">
                    {confirmStage ? "Are you absolutely sure?" : "Delete your account?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm">
                    {confirmStage
                      ? "This permanently removes your profile and signs you out. This cannot be undone."
                      : "Your profile and presence will be removed. You'll need to register again to come back. Tip: back up your chats first."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="text-sm h-10">Cancel</AlertDialogCancel>
                  {confirmStage ? (
                    <AlertDialogAction
                      onClick={deleteAccount}
                      disabled={deleting}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm h-10"
                    >
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </AlertDialogAction>
                  ) : (
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        setConfirmStage(true);
                      }}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm h-10"
                    >
                      Continue
                    </AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}

/** Strip technical noise (URLs, UUIDs, JSON blobs) before showing errors to users. */
function friendly(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  return raw
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim() || "Please try again.";
}
