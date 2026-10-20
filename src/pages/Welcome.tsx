import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/context";

export default function Welcome() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as { name?: string };
  const firstName = (state.name ?? "").split(" ")[0];

  useEffect(() => {
    document.title = t("wl.pageTitle");
  }, []);

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col items-center justify-center px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-12 h-12 text-accent" strokeWidth={2.2} />
        </div>
        <h1 className="text-[24px] font-bold text-foreground">{firstName ? t("wl.congratsName", { name: firstName }) : t("wl.congrats")}</h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-[280px]">
          {t("wl.body")}
        </p>

        <div className="absolute bottom-8 left-6 right-6">
          <Button
            onClick={() => navigate("/home")}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
          >
            {t("wl.continue")}
          </Button>
        </div>
      </div>
    </MobileFrame>
  );
}
