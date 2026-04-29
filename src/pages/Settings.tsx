import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  Smartphone,
  Trash2,
  User as UserIcon,
  Cloud,
  Contact2,
  RefreshCw,
  Camera,
  ImagePlus,
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
  type BackupRow,
} from "@/lib/chatBackup";
import {
  getDefaultContactAvatar,
  setDefaultContactAvatar,
} from "@/lib/deviceContacts";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

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

  const [defaultAvatar, setDefaultAvatarState] = useState<string | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Settings — Chichat";
    setDefaultAvatarState(getDefaultContactAvatar());
  }, []);

  const onPickAvatar = () => avatarFileRef.current?.click();

  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Pick under 2MB.", variant: "destructive" });
      return;
    }
    try {
      const url = await fileToDataUrl(f);
      setDefaultContactAvatar(url);
      setDefaultAvatarState(url);
      toast({ title: "Default contact photo updated" });
    } catch {
      toast({ title: "Could not load image", variant: "destructive" });
    } finally {
      e.target.value = "";
    }
  };

  const removeAvatar = () => {
    setDefaultContactAvatar(null);
    setDefaultAvatarState(null);
  };

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
        // Auto sync once after connecting
        setSyncing(true);
        const list = await syncGoogleContacts();
        toast({ title: "Contacts synced", description: `${list.length} contacts loaded.` });
      } catch (e) {
        toast({ title: "Google connect failed", description: String(e), variant: "destructive" });
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
      toast({ title: "Could not start Google sign-in", description: String(e), variant: "destructive" });
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const list = await syncGoogleContacts();
      toast({ title: "Contacts synced", description: `${list.length} contacts loaded.` });
    } catch (e) {
      toast({ title: "Sync failed", description: String(e), variant: "destructive" });
    } finally { setSyncing(false); }
  };

  const onBackup = async () => {
    setBackingUp(true);
    try {
      const r = await runBackup();
      toast({ title: "Backup complete", description: `${r.message_count} messages, ${r.media_count} media.` });
      setBackup(await getMyBackup());
    } catch (e) {
      toast({ title: "Backup failed", description: String(e), variant: "destructive" });
    } finally { setBackingUp(false); }
  };

  const onRestore = async () => {
    if (!window.confirm("Restore chats from your latest backup?")) return;
    setRestoring(true);
    try {
      const r = await runRestore();
      toast({ title: "Restore complete", description: `${r.restored} of ${r.total} messages restored.` });
    } catch (e) {
      toast({ title: "Restore failed", description: String(e), variant: "destructive" });
    } finally { setRestoring(false); }
  };

  const onToggleAuto = async (v: boolean) => {
    try {
      await setAutoBackup(v);
      setBackup((b) => (b ? { ...b, auto_backup_enabled: v } : b));
    } catch (e) {
      toast({ title: "Could not update setting", description: String(e), variant: "destructive" });
    }
  };

  const deleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    await supabase
      .from("profiles")
      .upsert(
        { id: user.id, display_name: "Deleted user", avatar_url: null, is_online: false },
        { onConflict: "id" },
      );
    await supabase.auth.signOut();
    setDeleting(false);
    toast({ title: "Account removed", description: "You have been signed out." });
    navigate("/register");
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-3 pt-4 pb-3 border-b border-border sticky top-0 bg-background z-10">
          <h1 className="text-sm font-semibold text-foreground">Settings</h1>
        </div>

        <div className="flex-1 px-3 py-4 flex flex-col">
          <button
            onClick={() => navigate("/profile")}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Profile setting</p>
              <p className="text-[11px] text-muted-foreground truncate">
                Edit name, photo and about
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>

          <button
            onClick={() => navigate("/settings/phone")}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Phone settings</p>
              <p className="text-[11px] text-muted-foreground truncate">
                Theme and ringtone
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Default new-contact photo */}
          <div className="mt-4 px-3 py-3 rounded-lg bg-secondary/40">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onPickAvatar}
                className="relative w-12 h-12 rounded-xl border-2 border-dashed border-primary/50 bg-primary/10 hover:bg-primary/15 flex items-center justify-center overflow-hidden"
                aria-label="Choose default contact photo"
              >
                {defaultAvatar ? (
                  <img src={defaultAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="w-5 h-5 text-primary" />
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Camera className="w-2.5 h-2.5" />
                </span>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">Default contact photo</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  Used as the avatar when adding a new contact.
                </p>
              </div>
              {defaultAvatar && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  className="text-[10px] text-muted-foreground hover:text-destructive px-2 h-7"
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
          <div className="mt-4 px-3 py-3 rounded-lg bg-secondary/40">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                <Contact2 className="w-4 h-4 text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">Google contacts</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {googleEmail ? `Connected as ${googleEmail}` : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {googleEmail ? (
                <button
                  onClick={syncNow}
                  disabled={syncing}
                  className="flex-1 h-8 rounded-md bg-primary text-primary-foreground text-[11px] font-medium disabled:opacity-60 inline-flex items-center justify-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
              ) : (
                <button
                  onClick={connectGoogle}
                  disabled={connecting}
                  className="flex-1 h-8 rounded-md bg-primary text-primary-foreground text-[11px] font-medium disabled:opacity-60"
                >
                  {connecting ? "Opening Google…" : "Connect Google"}
                </button>
              )}
            </div>
          </div>

          {/* Chat backup */}
          <div className="mt-3 px-3 py-3 rounded-lg bg-secondary/40">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                <Cloud className="w-4 h-4 text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">Chat backup</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {backup
                    ? `Last: ${new Date(backup.last_backup_at).toLocaleString()} · ${backup.message_count} msgs · ${bytesLabel(backup.total_bytes)}`
                    : "No backup yet"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between py-1.5">
              <span className="text-[11px] text-foreground">Auto-backup daily</span>
              <Switch
                checked={backup?.auto_backup_enabled ?? true}
                onCheckedChange={onToggleAuto}
              />
            </div>

            <div className="flex gap-2 mt-1">
              <button
                onClick={onBackup}
                disabled={backingUp}
                className="flex-1 h-8 rounded-md bg-primary text-primary-foreground text-[11px] font-medium disabled:opacity-60"
              >
                {backingUp ? "Backing up…" : "Back up now"}
              </button>
              <button
                onClick={onRestore}
                disabled={restoring || !backup}
                className="flex-1 h-8 rounded-md border border-border bg-background text-[11px] font-medium disabled:opacity-50"
              >
                {restoring ? "Restoring…" : "Restore"}
              </button>
            </div>
          </div>

          <div className="flex-1" />

          <div className="pt-6 pb-2">
            <AlertDialog onOpenChange={(o) => !o && setConfirmStage(false)}>
              <AlertDialogTrigger asChild>
                <button className="w-full h-10 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs flex items-center justify-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete account
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[280px]">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-sm">
                    {confirmStage ? "Are you absolutely sure?" : "Delete your account?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs">
                    {confirmStage
                      ? "This permanently removes your profile and signs you out. This cannot be undone."
                      : "Your profile and presence will be removed. You'll need to register again to come back. Tip: back up your chats first."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="text-xs h-9">Cancel</AlertDialogCancel>
                  {confirmStage ? (
                    <AlertDialogAction
                      onClick={deleteAccount}
                      disabled={deleting}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs h-9"
                    >
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </AlertDialogAction>
                  ) : (
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        setConfirmStage(true);
                      }}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs h-9"
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
