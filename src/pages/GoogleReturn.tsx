import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import MobileFrame from "@/components/MobileFrame";
import BrandHero from "@/components/BrandHero";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type GoogleSignupCheck = {
  allowed?: boolean;
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

      if (data?.allowed === false) {
        await supabase.auth.signOut();
        toast({
          title: "Complete registration first",
          description: "Your Google name and email were added. Fill the remaining details to continue.",
        });
        navigate("/register", {
          replace: true,
          state: { prefill: { email: data.email ?? "", name: data.full_name ?? "" } },
        });
        return;
      }

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