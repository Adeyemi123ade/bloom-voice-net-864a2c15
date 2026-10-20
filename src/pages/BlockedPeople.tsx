import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Ban } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { useLanguage } from "@/lib/i18n/context";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/chat/format";
import { useMyBlocks } from "@/lib/safety";
import { BlockDialog } from "@/components/chat/SafetyDialogs";

type Person = { id: string; display_name: string | null; avatar_url: string | null };

export default function BlockedPeople() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { showBackArrow, goBack } = useBackNavigation("/settings");
  const { user, loading } = useAuth();
  const blockedIds = useMyBlocks();
  const [people, setPeople] = useState<Person[]>([]);
  const [unblock, setUnblock] = useState<Person | null>(null);

  useEffect(() => {
    document.title = `${t("bp.title")} — Chichat`;
  }, [t]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  const key = blockedIds.slice().sort().join(",");
  useEffect(() => {
    if (blockedIds.length === 0) {
      setPeople([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", blockedIds);
      if (cancelled) return;
      const found = new Map((data ?? []).map((p) => [p.id, p as Person]));
      setPeople(blockedIds.map((id) => found.get(id) ?? { id, display_name: null, avatar_url: null }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <MobileFrame>
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
          <h1 className={`text-lg font-bold text-foreground ${showBackArrow ? "" : "pl-2"}`}>{t("bp.title")}</h1>
        </div>

        <div className="flex-1 px-4 py-4 flex flex-col gap-1">
          {people.length === 0 ? (
            <div className="flex flex-col items-center text-center pt-16 px-6">
              <span className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
                <Ban className="w-6 h-6 text-muted-foreground" />
              </span>
              <p className="text-base font-semibold text-foreground mt-4">{t("bp.none")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("bp.noneBody")}
              </p>
            </div>
          ) : (
            people.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-2 py-3 rounded-lg">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={p.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">
                    {initials(p.display_name)}
                  </AvatarFallback>
                </Avatar>
                <p className="flex-1 min-w-0 text-base text-foreground truncate">
                  {p.display_name ?? t("chat.chichatUser")}
                </p>
                <button
                  onClick={() => setUnblock(p)}
                  className="h-9 px-4 rounded-full border border-border text-sm font-medium text-primary"
                >
                  {t("chat.unblock")}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      {unblock && (
        <BlockDialog
          open={!!unblock}
          onOpenChange={(o) => !o && setUnblock(null)}
          userId={unblock.id}
          name={unblock.display_name ?? "this person"}
          blocked
        />
      )}
    </MobileFrame>
  );
}
