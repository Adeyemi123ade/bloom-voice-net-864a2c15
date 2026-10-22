import { useEffect, useState, type ReactNode } from "react";
import { getCallsSnapshot, requestEndCall } from "@/lib/activeCall";
import { useNavigate } from "react-router-dom";
import {
  Ban,
  Globe,
  Settings as Gear,
  Shield,
  UserCog,
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

  // "Sign out" (web and Android): ends the session on THIS device only and
  // goes to the sign-in screen. The account and everything in it (profile,
  // chats, contacts, calls, settings) stay on the server untouched, so
  // signing in again brings it all back. Removed here: this phone's push
  // registration (so it stops ringing for this account) and the saved
  // copies of chats on this phone (they load again after sign-in).
  // Deleting the account is separate (below) and never happens here.
  const signOut = async () => {
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
      window.location.replace("/login");
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
        <div className="px-4 pt-5 pb-3 sticky top-0 bg-background z-10">
          <h1 className="text-2xl font-bold text-foreground">{t("settings.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("settings.subtitle")}</p>
        </div>

        <div className="flex-1 px-4 pb-4 flex flex-col gap-3">
          {/* Account: profile, sign out, privacy. Open by default. */}
          <SettingsGroup icon={UserIcon} title={t("settings.account")} subtitle={t("settings.accountSub")}>
            <SettingsRow
              icon={UserCog}
              title={t("settings.profileSetting")}
              subtitle={t("settings.profileSub")}
              onClick={() => navigate("/profile")}
            />
            <SettingsRow
              icon={working ? Loader2 : LogOut}
              iconSpin={working}
              title={working ? t("settings.signingOut") : t("settings.signOut")}
              subtitle={t("settings.signOutSub")}
              onClick={() => void signOut()}
              disabled={working}
              testId="sign-out"
            />
            <SettingsRow
              icon={Shield}
              title={t("settings.privacyAccount")}
              subtitle={t("settings.privacyAccountSub")}
              onClick={() => navigate("/privacy")}
            />
          </SettingsGroup>

          {/* Preferences: everything else, unchanged. Open by default. */}
          <SettingsGroup icon={Gear} title={t("settings.preferences")} subtitle={t("settings.preferencesSub")}>
            <SettingsRow icon={Smartphone} title={t("settings.phone")} subtitle={t("settings.phoneSub")} onClick={() => navigate("/settings/phone")} />
            <SettingsRow icon={SlidersHorizontal} title={t("settings.app")} subtitle={t("settings.appSub")} onClick={() => navigate("/settings/app")} />
            {/* Language: shown in the chosen language's own name. */}
            <SettingsRow icon={Globe} title={t("settings.language")} subtitle={languageName} onClick={() => setLangOpen(true)} />
            <SettingsRow icon={Ban} title={t("settings.blocked")} subtitle={t("settings.blockedSub")} onClick={() => navigate("/settings/blocked")} />
            <SettingsRow
              icon={Cloud}
              title={t("settings.backup")}
              subtitle={
                backup
                  ? t("settings.lastBackup", {
                      date: new Date(backup.last_backup_at).toLocaleDateString(language),
                      count: backup.message_count,
                    })
                  : t("settings.noBackup")
              }
              onClick={() => navigate("/settings/backup")}
            />
            {/* Feedback for the ChiChat team (testers' main channel). */}
            <SettingsRow icon={MessageSquareText} title={t("fb.title")} subtitle={t("fb.rowSub")} onClick={() => navigate("/settings/feedback")} />
            {isAdmin && (
              <SettingsRow icon={ShieldCheck} title="Admin" subtitle="Reports, people, feedback, problems" onClick={() => navigate("/admin")} />
            )}
          </SettingsGroup>
          <LanguagePicker open={langOpen} onOpenChange={setLangOpen} />

          {/* Delete account: its own pale red card, separate from Sign out.
              Permanent, always behind the confirmation below. Kept in the
              app because Google Play requires deletion inside the app. */}
          <div
            data-testid="delete-card"
            className="rounded-2xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3.5 flex flex-col items-center gap-3"
          >
            <p className="text-[13px] text-muted-foreground text-center leading-snug">{t("settings.deleteSub")}</p>
            <button
              onClick={() => setDeleteOpen(true)}
              data-testid="delete-account"
              className="inline-flex items-center gap-2 h-9 px-5 rounded-full border border-destructive/40 bg-background/70 text-destructive text-sm font-bold transition-colors hover:bg-destructive hover:text-white hover:border-destructive active:bg-destructive active:text-white active:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
            >
              <Trash2 className="w-4 h-4" />
              {t("settings.deleteMine")}
            </button>
          </div>

          <div className="flex-1" />

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

type IconType = typeof UserIcon;

/** A card with a header that opens and closes (open to start). */
function SettingsGroup({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: IconType;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen className="rounded-2xl border border-border bg-card overflow-hidden">
      <CollapsibleTrigger className="w-full flex items-center gap-3 px-3 py-3 text-left bg-primary/[0.06] group">
        <span className="w-11 h-11 shrink-0 rounded-full bg-primary/15 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-foreground leading-tight">{title}</p>
          <p className="text-[13px] text-muted-foreground leading-snug mt-0.5">{subtitle}</p>
        </div>
        <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="divide-y divide-border">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** One row inside a group: icon, title, one line under it, arrow. */
function SettingsRow({
  icon: Icon,
  iconSpin = false,
  title,
  subtitle,
  onClick,
  disabled = false,
  testId,
}: {
  icon: IconType;
  iconSpin?: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/60 active:bg-secondary disabled:opacity-60"
    >
      <span className="w-11 h-11 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className={`w-5 h-5 text-primary ${iconSpin ? "animate-spin" : ""}`} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-foreground leading-tight">{title}</p>
        <p className="text-[13px] text-muted-foreground leading-snug mt-0.5">{subtitle}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
    </button>
  );
}
