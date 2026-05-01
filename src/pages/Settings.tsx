import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  LogOut,
  Smartphone,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isWebApp } from "@/lib/platform";
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
  const [working, setWorking] = useState(false);
  const [backup, setBackup] = useState<BackupRow | null>(null);
  const onWeb = isWebApp();

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


  // Mobile "Uninstall app": local-only wipe + global sign-out. No backend
  // delete — accounts are never deleted, only the app is removed from this
  // phone. If the user comes back they sign in with the same email.
  const uninstallOnDevice = async () => {
    if (!user) return;
    setWorking(true);
    try {
      try { await supabase.auth.signOut({ scope: "global" }); } catch { /* ignore */ }
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
      toast({ title: "App removed from this device" });
      window.location.replace("/");
    } finally {
      setWorking(false);
    }
  };

  // Web "Sign out": just end the session on this browser.
  const signOutWeb = async () => {
    setWorking(true);
    try {
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
      toast({ title: "Signed out" });
      window.location.replace("/login");
    } finally {
      setWorking(false);
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
                  Profile · {user?.email ?? "this device"}
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

          {/* Bottom action — Web shows "Sign out" (just ends the session on
              this browser). Mobile keeps "Uninstall app" which wipes the app
              from this device only. Accounts are never deleted; the email
              stays usable for future sign-ins from any device. */}
          <div className="pt-10 pb-4">
            {onWeb ? (
              <button
                onClick={signOutWeb}
                disabled={working}
                className="w-full h-16 rounded-xl bg-secondary text-foreground text-lg font-bold flex items-center justify-center gap-3 border border-border hover:bg-secondary/80 active:scale-[0.99] transition disabled:opacity-60"
              >
                <LogOut className="w-6 h-6" />
                {working ? "Signing out…" : "Sign out"}
              </button>
            ) : (
              <AlertDialog onOpenChange={(o) => !o && setConfirmStage(false)}>
                <AlertDialogTrigger asChild>
                  <button className="w-full h-16 rounded-xl bg-destructive text-destructive-foreground text-lg font-bold flex items-center justify-center gap-3 shadow-lg shadow-destructive/30 hover:bg-destructive/90 active:scale-[0.99] transition">
                    <Trash2 className="w-6 h-6" />
                    Uninstall app
                  </button>
                </AlertDialogTrigger>
                <p className="text-xs text-muted-foreground text-center mt-2 px-4">
                  Removes the app and its data from this device. Your account stays — sign back in any time. Back up your chats first.
                </p>
                <AlertDialogContent className="max-w-[320px]">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-base">
                      {confirmStage ? "Are you absolutely sure?" : "Uninstall Chichat?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-sm">
                      {confirmStage
                        ? "This removes the app and all of its data from this device. Your account stays — you can sign back in with the same email any time."
                        : "Uninstalling clears chats, contacts and presence from this device. Your account is not deleted — you can sign back in later. Tip: back up your chats first."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="text-sm h-10">Cancel</AlertDialogCancel>
                    {confirmStage ? (
                      <AlertDialogAction
                        onClick={uninstallOnDevice}
                        disabled={working}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm h-10"
                      >
                        {working ? "Uninstalling…" : "Yes, uninstall"}
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
            )}
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
