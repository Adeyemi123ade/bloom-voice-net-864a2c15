import { useEffect, useState } from "react";
import { getCallsSnapshot, requestEndCall } from "@/lib/activeCall";
import { useNavigate } from "react-router-dom";
import {
  Ban,
  Globe,
  ChevronDown,
  ChevronRight,
  Cloud,
  Loader2,
  LogOut,
  MessageSquareText,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { unregisterCallPush } from "@/lib/fcmRegistration";
import { toast } from "@/hooks/use-toast";
import { isWebApp } from "@/lib/platform";
import LanguagePicker from "@/components/LanguagePicker";
import { useLanguage } from "@/lib/i18n/context";
import { LANGUAGES } from "@/lib/i18n/strings";
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
} from "@/components/ui/alert-dialog";
import { getMyBackup, type BackupRow } from "@/lib/chatBackup";
import { amIAdmin } from "@/lib/admin";
import { deleteMyAccount } from "@/lib/deleteAccount";
import { APP_VERSION } from "@/lib/appBuild";

export default function Settings() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { t, language } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);
  const languageName = LANGUAGES.find((l) => l.code === language)?.name ?? "English";

  const [working, setWorking] = useState(false);
  const [backup, setBackup] = useState<BackupRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const onWeb = isWebApp();

  useEffect(() => {
    document.title = `${t("settings.title")} — Chichat`;
  }, [t]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  // The Admin row only shows for admin accounts.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void amIAdmin().then((yes) => !cancelled && setIsAdmin(yes));
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Load backup row (for the summary line on the Chat backup nav row)
  useEffect(() => {
    if (!user) return;
    (async () => setBackup(await getMyBackup()))();
  }, [user]);

  // Web "Sign out": just end the session on this browser.
  const signOutWeb = async () => {
    setWorking(true);
    try {
      // Signing out is a deliberate end to any call that is on.
      const calls = getCallsSnapshot().calls;
      if (calls.length) {
        calls.forEach((c) => requestEndCall(c.callId));
        await new Promise((r) => setTimeout(r, 800));
      }
      await unregisterCallPush();
      // This device only: the default ("global") also signed the account out
      // on every other phone and computer.
      try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
      toast({ title: t("settings.signedOut") });
      window.location.replace("/");
    } finally {
      setWorking(false);
    }
  };

  // Permanently deletes the account and all associated data server-side,
  // then ends the local session. Goes through the delete-account edge
  // function so cleanup (profile, messages, calls, device bindings, email
  // records, and finally the auth user itself) always runs consistently —
  // this is the only supported way to delete an account.
  const handleDeleteAccount = async () => {
    setDeleting(true);
    if (await deleteMyAccount()) {
      toast({ title: t("settings.deleted") });
      window.location.replace("/");
      return;
    }
    toast({ title: t("settings.deleteFail"), description: t("auth.tryAgainMoment"), variant: "destructive" });
    setDeleting(false);
  };


  return (
    <MobileFrame bottomNav="settings">
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-4 pt-5 pb-4 border-b border-border sticky top-0 bg-background z-10">
          <h1 className="text-lg font-bold text-foreground">{t("settings.title")}</h1>
        </div>

        <div className="flex-1 px-4 py-4 flex flex-col gap-2">
          {/* 1. Phone settings — Theme, Ringtone. */}
          <button
            onClick={() => navigate("/settings/phone")}
            className="w-full flex items-center gap-3 px-3 py-3.5 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">{t("settings.phone")}</p>
              <p className="text-sm text-muted-foreground truncate">
                {t("settings.phoneSub")}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* App settings: notifications, autostart, battery, transcription. */}
          <button
            onClick={() => navigate("/settings/app")}
            className="w-full flex items-center gap-3 px-3 py-3.5 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">{t("settings.app")}</p>
              <p className="text-sm text-muted-foreground truncate">
                {t("settings.appSub")}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Language: shown in the chosen language's own name. */}
          <button
            onClick={() => setLangOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-3.5 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">{t("settings.language")}</p>
              <p className="text-sm text-muted-foreground truncate">{languageName}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
          <LanguagePicker open={langOpen} onOpenChange={setLangOpen} />

          {/* Blocked people. */}
          <button
            onClick={() => navigate("/settings/blocked")}
            className="w-full flex items-center gap-3 px-3 py-3.5 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Ban className="w-5 h-5 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">{t("settings.blocked")}</p>
              <p className="text-sm text-muted-foreground truncate">{t("settings.blockedSub")}</p>
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
              <p className="text-base font-semibold text-foreground">{t("settings.backup")}</p>
              <p className="text-sm text-muted-foreground truncate">
                {backup
                  ? t("settings.lastBackup", {
                      date: new Date(backup.last_backup_at).toLocaleDateString(language),
                      count: backup.message_count,
                    })
                  : t("settings.noBackup")}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Feedback for the ChiChat team (testers' main channel). */}
          <button
            onClick={() => navigate("/settings/feedback")}
            className="w-full flex items-center gap-3 px-3 py-3.5 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <MessageSquareText className="w-5 h-5 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground">{t("fb.title")}</p>
              <p className="text-sm text-muted-foreground truncate">{t("fb.rowSub")}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          {isAdmin && (
            <button
              onClick={() => navigate("/admin")}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-lg hover:bg-secondary text-left"
            >
              <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-foreground">Admin</p>
                <p className="text-sm text-muted-foreground truncate">Reports, people, feedback, problems</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          )}

          {/* 3. Account — collapsible. Holds Profile setting + sign-out. */}
          <Collapsible className="rounded-lg bg-secondary/30">
            <CollapsibleTrigger className="w-full flex items-center gap-3 px-3 py-3.5 text-left group">
              <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-foreground">{t("settings.account")}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {t("settings.profile")} · {user?.email ?? t("settings.thisDevice")}
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
                  <p className="text-sm font-semibold text-foreground">{t("settings.profileSetting")}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t("settings.profileSub")}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>

              <button
                onClick={() => setDeleteOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-md bg-background border border-destructive/30 text-left"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-destructive">{t("settings.delete")}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t("settings.deleteSub")}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex-1" />

          {/* Bottom action — Web only shows "Sign out". Mobile has no button;
              users uninstall the app natively through Android. */}
          {onWeb && (
            <div className="pt-10 pb-4">
              <button
                onClick={signOutWeb}
                disabled={working}
                className="w-full h-16 rounded-xl bg-secondary text-foreground text-lg font-bold flex items-center justify-center gap-3 border border-border transition hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-secondary disabled:hover:text-foreground"
              >
                {working ? <Loader2 className="w-6 h-6 animate-spin" /> : <LogOut className="w-6 h-6" />}
                {working ? t("settings.signingOut") : t("settings.signOut")}
              </button>
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground pt-2 pb-1">
            {t("settings.version", { build: APP_VERSION })}
          </p>
        </div>

        <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
          <AlertDialogContent className="max-w-[320px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">
                {t("settings.deleteTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                {t("settings.deleteBody")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting} className="text-sm h-10">
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteAccount();
                }}
                disabled={deleting}
                className="text-sm h-10 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? t("settings.deleting") : t("settings.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MobileFrame>
  );
}
