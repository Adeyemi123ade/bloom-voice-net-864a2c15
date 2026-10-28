import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Loader2, LogOut, type LucideIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getCallsSnapshot, requestEndCall } from "@/lib/activeCall";
import { unregisterCallPush } from "@/lib/fcmRegistration";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n/context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** A card with a header that opens and closes (open to start). */
export function SettingsGroup({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
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

/** One row: icon, title, one line under it, arrow. */
export function SettingsRow({
  icon: Icon,
  iconSpin = false,
  title,
  subtitle,
  onClick,
  disabled = false,
  testId,
}: {
  icon: LucideIcon;
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

/**
 * "Sign out" in its own card (both Settings screens). Ends the session on
 * THIS device only and goes to the sign-in screen. The account and
 * everything in it stay on the server, so signing in again brings it all
 * back. Removed here: this phone's push registration (so it stops ringing
 * for this account) and the saved copies of chats on this phone. Deleting
 * the account is separate and never happens here.
 */
export function SignOutCard() {
  const { t } = useLanguage();
  const [working, setWorking] = useState(false);
  // A tap on Sign out asks first, so a mistaken touch can be cancelled.
  const [confirming, setConfirming] = useState(false);
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
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <SettingsRow
        icon={working ? Loader2 : LogOut}
        iconSpin={working}
        title={working ? t("settings.signingOut") : t("settings.signOut")}
        subtitle={t("settings.signOutSub")}
        onClick={() => setConfirming(true)}
        disabled={working}
        testId="sign-out"
      />
      <AlertDialog open={confirming} onOpenChange={(open) => !working && setConfirming(open)}>
        <AlertDialogContent className="max-w-[320px]" aria-describedby={undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{t("settings.signOutConfirmTitle")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working} className="text-sm h-10">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="sign-out-confirm"
              disabled={working}
              className="text-sm h-10"
              onClick={(e) => {
                e.preventDefault();
                setConfirming(false);
                void signOut();
              }}
            >
              {t("settings.signOut")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
