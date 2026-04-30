import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  Smartphone,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { getMyBackup, type BackupRow } from "@/lib/chatBackup";
import { clearContactsCache } from "@/lib/deviceContacts";

export default function Settings() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [confirmStage, setConfirmStage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [backup, setBackup] = useState<BackupRow | null>(null);

  useEffect(() => {
    document.title = "Settings — Chichat";
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  // Google OAuth redirects back here with ?code=…; the actual completion lives
  // inside Phone settings now, so forward the user there preserving the code.
  useEffect(() => {
    const search = window.location.search;
    if (search.includes("code=") && search.includes("scope=")) {
      navigate(`/settings/phone${search}`, { replace: true });
    }
  }, [navigate]);

  // Load backup row (for the summary line on the Chat backup nav row)
  useEffect(() => {
    if (!user) return;
    (async () => setBackup(await getMyBackup()))();
  }, [user]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut({ scope: "global" });
      window.location.replace("/login");
    } catch (e) {
      toast({ title: "Could not sign out", description: friendly(e), variant: "destructive" });
      setSigningOut(false);
    }
  };

  const deleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("delete-account", {});
      const serverOk = !fnError && (data as any)?.ok === true;

      if (!serverOk) {
        await supabase
          .from("profiles")
          .update({ display_name: null, avatar_url: null, phone: null, is_online: false })
          .eq("id", user.id);
        toast({
          title: "Couldn't fully uninstall",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
      } else {
        toast({ title: "App uninstalled", description: "Your account and all data have been removed." });
      }

      await supabase.auth.signOut({ scope: "global" }).catch(() => {});
      try {
        clearContactsCache();
        localStorage.clear();
        sessionStorage.clear();
        if (typeof indexedDB !== "undefined" && indexedDB.databases) {
          const dbs = await indexedDB.databases();
          await Promise.all(
            dbs.map((d) => d.name ? new Promise<void>((res) => {
              const req = indexedDB.deleteDatabase(d.name!);
              req.onsuccess = req.onerror = req.onblocked = () => res();
            }) : Promise.resolve())
          );
        }
      } catch { /* ignore */ }

      window.location.replace("/register");
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

        <div className="flex-1 px-4 py-4 flex flex-col gap-2">
          {/* 1. Phone settings — Theme, Ringtone, Google account & contacts. */}
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
                Theme, ringtone, Google account
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* 2. Chat backup — opens a dedicated page (no longer collapsible). */}
          <button
            onClick={() => navigate("/settings/backup")}
            className="w-full flex items-center gap-3 px-3 py-3.5 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">Chat backup</p>
              <p className="text-sm text-muted-foreground truncate">
                {backup
                  ? `Last: ${new Date(backup.last_backup_at).toLocaleDateString()} · ${backup.message_count} msgs`
                  : "No backup yet"}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* 3. Account — collapsible. Holds Profile setting + sign-out. */}
          <Collapsible className="rounded-lg bg-secondary/30">
            <CollapsibleTrigger className="w-full flex items-center gap-3 px-3 py-3.5 text-left group">
              <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-foreground">Account</p>
                <p className="text-sm text-muted-foreground truncate">
                  Profile, sign out · {user?.email ?? "this device"}
                </p>
              </div>
              <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3 pt-1 flex flex-col gap-2">
              <button
                onClick={() => navigate("/profile")}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-md bg-background border border-border text-left"
              >
                <UserIcon className="w-4 h-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Profile setting</p>
                  <p className="text-xs text-muted-foreground truncate">
                    Edit name, photo and about
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>

            </CollapsibleContent>
          </Collapsible>

          <div className="flex-1" />

          {/* Delete is intentionally separated and made larger / more prominent.
              Represents removing the entire app + account from this device. */}
          <div className="pt-10 pb-4">
            <AlertDialog onOpenChange={(o) => !o && setConfirmStage(false)}>
              <AlertDialogTrigger asChild>
                <button className="w-full h-16 rounded-xl bg-destructive text-destructive-foreground text-lg font-bold flex items-center justify-center gap-3 shadow-lg shadow-destructive/30 hover:bg-destructive/90 active:scale-[0.99] transition">
                  <Trash2 className="w-6 h-6" />
                  Uninstall app
                </button>
              </AlertDialogTrigger>
              <p className="text-xs text-muted-foreground text-center mt-2 px-4">
                Removes your account and all data from this device. Back up your chats first.
              </p>
              <AlertDialogContent className="max-w-[320px]">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-base">
                    {confirmStage ? "Are you absolutely sure?" : "Uninstall Chichat?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm">
                    {confirmStage
                      ? "This permanently removes your account and every trace of the app from this device. You'll be a brand-new user if you ever come back."
                      : "Uninstalling wipes your account, chats, contacts and presence — completely. The app will behave like a fresh install. Tip: back up your chats first."}
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
                      {deleting ? "Uninstalling…" : "Yes, uninstall"}
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
