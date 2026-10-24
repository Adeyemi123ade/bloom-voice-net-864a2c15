import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  Cloud,
  Globe,
  MessageSquareText,
  Settings as Gear,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trash2,
} from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { useAuth } from "@/hooks/useAuth";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { toast } from "@/hooks/use-toast";
import LanguagePicker from "@/components/LanguagePicker";
import { useLanguage } from "@/lib/i18n/context";
import { LANGUAGES } from "@/lib/i18n/strings";
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
import { SettingsGroup, SettingsRow, SignOutCard } from "@/components/settings/SettingsParts";

/** Settings, screen 2 ("Preferences"): phone, app, language, blocked, backup, feedback, sign out, delete. */
export default function SettingsPreferences() {
  const navigate = useNavigate();
  const { showBackArrow, goBack } = useBackNavigation("/settings");
  const { user, loading } = useAuth();
  const { t, language } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);
  const languageName = LANGUAGES.find((l) => l.code === language)?.name ?? "English";
  const [backup, setBackup] = useState<BackupRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = `${t("settings.preferences")} — Chichat`;
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

  // Summary line on the Chat backup row.
  useEffect(() => {
    if (!user) return;
    (async () => setBackup(await getMyBackup()))();
  }, [user]);

  // Permanently deletes the account through the delete-account function, the
  // only supported way, then ends the local session.
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
        <div className="px-2 pt-4 pb-3 flex items-center gap-2 border-b border-border sticky top-0 bg-background z-10">
          {showBackArrow && (
            <button
              onClick={goBack}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
              aria-label={t("common.back")}
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <h1 className={`text-base font-semibold text-foreground ${showBackArrow ? "" : "pl-2"}`}>
            {t("settings.title")}
          </h1>
        </div>

        <div className="flex-1 px-4 py-4 flex flex-col gap-3">
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
            <SettingsRow icon={MessageSquareText} title={t("fb.title")} subtitle={t("fb.rowSub")} onClick={() => navigate("/settings/feedback")} />
            {isAdmin && (
              <SettingsRow icon={ShieldCheck} title="Admin" subtitle="Reports, people, feedback, problems" onClick={() => navigate("/admin")} />
            )}
          </SettingsGroup>
          <LanguagePicker open={langOpen} onOpenChange={setLangOpen} />

          <SignOutCard />

          {/* Delete account: its own pale red card. Permanent, always behind
              the confirmation below. Kept in the app because Google Play
              requires deletion inside the app. */}
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
        </div>

        <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
          <AlertDialogContent className="max-w-[320px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">{t("settings.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">{t("settings.deleteBody")}</AlertDialogDescription>
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
