import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import MobileFrame from "@/components/MobileFrame";
import BrandHero from "@/components/BrandHero";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type GoogleSignupCheck = {
  allowed?: boolean;
  pending_registration?: boolean;
  email?: string;
  full_name?: string;
};

export default function GoogleReturn() {
  const navigate = useNavigate();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    (async () => {
      // getSession() queues behind the client's own in-flight session
      // hydration (URL-hash parsing on web, or the setSession() call
      // GoogleOAuthReturnListener already awaited on native) rather than
      // just reading whatever's in memory right now — awaiting it first
      // closes the race where check-google-signup could otherwise fire
      // with no session yet attached and get treated as a hard failure.
      await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke<GoogleSignupCheck>("check-google-signup");

      if (error) {
        await supabase.auth.signOut();
        toast({
          title: "Google couldn't be verified",
          description: "Please sign in with your email and password, or register with the form.",
          variant: "destructive",
        });
        navigate("/login", { replace: true });
        return;
      }

      // Pending registration: keep the Google session alive and send the user
      // to /register pre-filled. They finish phone + password and we call
      // complete-google-registration on submit. No email OTP.
      if (data?.allowed === false && data.pending_registration) {
        toast({
          title: "Almost done",
          description: "Add your phone and a password to finish creating your account.",
        });
        navigate("/register", {
          replace: true,
          state: {
            prefill: {
              email: data.email ?? "",
              name: data.full_name ?? "",
              googleVerified: true,
            },
          },
        });
        return;
      }

      // Existing user — straight in.
      navigate("/home", { replace: true });
    })();
  }, [navigate]);

  return (
    <MobileFrame>
      <div className="h-full w-full flex items-center justify-center bg-background px-6">
        <BrandHero message="Checking your Google account…" />
      </div>
    </MobileFrame>
  );
}
