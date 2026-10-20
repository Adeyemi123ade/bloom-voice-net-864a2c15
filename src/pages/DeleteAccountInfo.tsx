import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Trash2 } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { clearAfterSignIn, returnAfterSignIn } from "@/lib/afterSignIn";
import { deleteMyAccount } from "@/lib/deleteAccount";
import { useLanguage } from "@/lib/i18n/context";
import { SUPPORT_EMAIL } from "@/lib/support";

/**
 * Public page (chichatapp.com/delete-account) for deleting a ChiChat account,
 * also when the app isn't installed any more. Google Play asks for this link.
 */
export default function DeleteAccountInfo() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = `${t("da.title")} — Chichat`;
  }, [t]);

  useEffect(() => {
    if (user) clearAfterSignIn();
  }, [user]);

  const signIn = () => {
    returnAfterSignIn("/delete-account");
    navigate("/login");
  };

  const confirmDelete = async () => {
    setDeleting(true);
    if (await deleteMyAccount()) {
      toast({ title: t("settings.deleted") });
      window.location.replace("/");
      return;
    }
    setDeleting(false);
    setConfirmOpen(false);
    toast({ title: t("settings.deleteFail"), description: t("auth.tryAgainMoment"), variant: "destructive" });
  };

  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Delete my ChiChat account")}`;

  return (
    <MobileFrame>
      <div className="h-full w-full overflow-y-auto bg-background">
        <article className="px-5 py-6 flex flex-col gap-5 text-foreground">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">{t("da.title")}</h1>
            <p className="text-base text-muted-foreground">{t("da.intro")}</p>
          </header>

          <section className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : user ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("da.signedInAs", { email: user.email ?? "" })}
                </p>
                <Button variant="destructive" className="h-12 text-base" onClick={() => setConfirmOpen(true)}>
                  <Trash2 className="w-5 h-5 mr-2" aria-hidden />
                  {t("settings.delete")}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t("da.signInFirst")}</p>
                <Button className="h-12 text-base" onClick={signIn}>
                  {t("da.signIn")}
                </Button>
              </>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("da.inAppTitle")}</h2>
            <ol className="list-decimal ps-5 text-base flex flex-col gap-1">
              <li>{t("da.step1", { settings: t("settings.title") })}</li>
              <li>{t("da.step2", { account: t("settings.account"), delete: t("settings.delete") })}</li>
              <li>{t("da.step3")}</li>
            </ol>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("da.cantSignInTitle")}</h2>
            <p className="text-base">
              {t("da.cantSignInBody")}{" "}
              <a className="text-primary font-semibold underline break-all" href={mailto}>
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p className="text-sm text-muted-foreground">{t("da.emailTime")}</p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("da.whatTitle")}</h2>
            <ul className="list-disc ps-5 text-base flex flex-col gap-1">
              <li>{t("da.what1")}</li>
              <li>{t("da.what2")}</li>
              <li>{t("da.what3")}</li>
              <li>{t("da.what4")}</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("da.keptTitle")}</h2>
            <ul className="list-disc ps-5 text-base flex flex-col gap-1">
              <li>{t("da.kept1")}</li>
              <li>{t("da.kept2")}</li>
            </ul>
          </section>
        </article>

        <AlertDialog open={confirmOpen} onOpenChange={(o) => !deleting && setConfirmOpen(o)}>
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
                  void confirmDelete();
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
