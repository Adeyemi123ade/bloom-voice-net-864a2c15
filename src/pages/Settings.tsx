import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings as Gear, Shield, User as UserIcon, UserCog } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/lib/i18n/context";
import { APP_VERSION } from "@/lib/appBuild";
import { SettingsGroup, SettingsRow, SignOutCard } from "@/components/settings/SettingsParts";

/**
 * Settings, screen 1: the account. Everything else (phone, app, language,
 * blocked, backup, feedback, delete) is on screen 2, behind "Preferences"
 * (SettingsPreferences), so this screen stays short.
 */
export default function Settings() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    document.title = `${t("settings.title")} — Chichat`;
  }, [t]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  return (
    <MobileFrame bottomNav="settings">
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        <div className="px-4 pt-5 pb-3 sticky top-0 bg-background z-10">
          <h1 className="text-2xl font-bold text-foreground">{t("settings.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("settings.subtitle")}</p>
        </div>

        <div className="flex-1 px-4 pb-4 flex flex-col gap-3">
          <SettingsGroup icon={UserIcon} title={t("settings.account")} subtitle={t("settings.accountSub")}>
            <SettingsRow
              icon={UserCog}
              title={t("settings.profileSetting")}
              subtitle={t("settings.profileSub")}
              onClick={() => navigate("/profile")}
            />
            <SettingsRow
              icon={Shield}
              title={t("settings.privacyAccount")}
              subtitle={t("settings.privacyAccountSub")}
              onClick={() => navigate("/privacy")}
            />
            <SettingsRow
              icon={Gear}
              title={t("settings.preferences")}
              subtitle={t("settings.preferencesSub")}
              onClick={() => navigate("/settings/preferences")}
              testId="open-preferences"
            />
          </SettingsGroup>

          <SignOutCard />

          <div className="flex-1" />

          <p className="text-center text-xs text-muted-foreground pt-2 pb-1">
            {t("settings.version", { build: APP_VERSION })}
          </p>
        </div>
      </div>
    </MobileFrame>
  );
}
