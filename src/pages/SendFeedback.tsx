import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ImagePlus, Loader2, X } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n/context";
import type { TextKey } from "@/lib/i18n/strings";
import { sendFeedback, type FeedbackCategory } from "@/lib/feedback";

const CATEGORIES: { id: FeedbackCategory; label: TextKey }[] = [
  { id: "broken", label: "fb.catBroken" },
  { id: "calls", label: "fb.catCalls" },
  { id: "messages", label: "fb.catMessages" },
  { id: "idea", label: "fb.catIdea" },
  { id: "other", label: "fb.catOther" },
];

const MAX_SHOT_BYTES = 5 * 1024 * 1024;

/** Settings > Send feedback: what happened, plus an optional screenshot. */
export default function SendFeedback() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { showBackArrow, goBack } = useBackNavigation("/settings");
  const { user, loading } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message, setMessage] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = `${t("fb.title")} — Chichat`;
  }, [t]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!shot) {
      setShotUrl(null);
      return;
    }
    const url = URL.createObjectURL(shot);
    setShotUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [shot]);

  const pickShot = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: t("fb.shotNotImage") });
      return;
    }
    if (file.size > MAX_SHOT_BYTES) {
      toast({ title: t("chat.fileTooLarge"), description: t("fb.shotMax") });
      return;
    }
    setShot(file);
  };

  const canSend = !!category && message.trim().length > 0 && !sending;

  const send = async () => {
    if (!user || !category || !message.trim()) return;
    setSending(true);
    const ok = await sendFeedback({
      userId: user.id,
      category,
      message: message.trim(),
      screenshot: shot,
      language,
    });
    setSending(false);
    if (!ok) {
      toast({ title: t("fb.failed"), description: t("chat.checkConnection"), variant: "destructive" });
      return;
    }
    toast({ title: t("fb.thanks"), description: t("fb.thanksBody") });
    navigate("/settings", { replace: true });
  };

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
          <h1 className={`text-lg font-bold text-foreground ${showBackArrow ? "" : "pl-2"}`}>{t("fb.title")}</h1>
        </div>

        <div className="flex-1 px-4 py-4 flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">{t("fb.intro")}</p>

          <section>
            <p className="text-sm font-semibold text-foreground mb-2">{t("fb.about")}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("fb.about")}>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={`px-3.5 h-10 rounded-full border text-sm font-medium transition-colors ${
                    category === c.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-secondary"
                  }`}
                >
                  {t(c.label)}
                </button>
              ))}
            </div>
          </section>

          <section>
            <label htmlFor="fb-message" className="text-sm font-semibold text-foreground block mb-2">
              {t("fb.what")}
            </label>
            <Textarea
              id="fb-message"
              dir="auto"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
              placeholder={t("fb.whatPh")}
              rows={6}
              className="text-base"
            />
          </section>

          <section>
            <p className="text-sm font-semibold text-foreground mb-2">{t("fb.shot")}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                pickShot(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {shotUrl ? (
              <div className="relative w-32">
                <img src={shotUrl} alt="" className="w-32 h-48 object-cover rounded-xl border border-border" />
                <button
                  type="button"
                  onClick={() => setShot(null)}
                  aria-label={t("fb.removeShot")}
                  className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full h-14 rounded-xl border border-dashed border-border flex items-center justify-center gap-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                <ImagePlus className="w-5 h-5 text-primary" />
                {t("fb.addShot")}
              </button>
            )}
          </section>

          <p className="text-xs text-muted-foreground">{t("fb.deviceNote")}</p>

          <div className="flex-1" />
          <Button className="w-full h-12 text-base" disabled={!canSend} onClick={() => void send()}>
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : t("fb.send")}
          </Button>
        </div>
      </div>
    </MobileFrame>
  );
}
