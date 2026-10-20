import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/context";
import { SUPPORT_EMAIL } from "@/lib/support";

/** Shown after a suspended account is signed out. */
export default function AccountSuspended() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  useEffect(() => {
    document.title = `${t("sus.title")} · ChiChat`;
  }, [t]);
  return (
    <MobileFrame>
      <div className="h-full flex flex-col items-center justify-center px-8 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-destructive" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-foreground">{t("sus.title")}</h1>
        <p className="text-base text-muted-foreground">{t("sus.body")}</p>
        <p className="text-sm text-muted-foreground">
          {t("sus.contact")}{" "}
          <a className="text-primary font-semibold underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </p>
        <Button className="mt-2 w-full max-w-xs" onClick={() => navigate("/", { replace: true })}>
          {t("common.ok")}
        </Button>
      </div>
    </MobileFrame>
  );
}
