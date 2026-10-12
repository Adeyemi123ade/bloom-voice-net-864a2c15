import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { ShareInviteCard } from "@/components/contacts/ShareInviteCard";
import { useBackNavigation } from "@/hooks/useBackNavigation";

export default function InviteFriends() {
  const navigate = useNavigate();
  const { showBackArrow, goBack } = useBackNavigation("/contacts");

  useEffect(() => {
    document.title = "Invite friends — Chichat";
  }, []);

  return (
    <MobileFrame bottomNav="contacts">
      <div className="h-full w-full flex flex-col bg-background">
        <div className="px-3 pt-4 pb-3 border-b border-border flex items-center gap-2">
          {showBackArrow && (
            <button
              aria-label="Back"
              onClick={goBack}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <h1 className={`text-base font-semibold text-foreground ${showBackArrow ? "" : "pl-1"}`}>Invite friends</h1>
        </div>

        <div className="flex-1 overflow-y-auto pt-4">
          <ShareInviteCard />
          <p className="px-5 mt-4 text-xs text-muted-foreground leading-relaxed">
            Tap <span className="font-semibold text-foreground">Share</span> to choose any
            app on your phone — WhatsApp, SMS, Gmail and more. Your friend gets the
            invite message together with the link to download Chichat.
          </p>
        </div>
      </div>
    </MobileFrame>
  );
}
