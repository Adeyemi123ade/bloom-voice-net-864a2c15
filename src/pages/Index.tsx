import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isRecoveryPending } from "@/lib/recoveryPending";
import { getVerifyEmailPending } from "@/lib/verifyEmailPending";
import SplashScreen from "./SplashScreen";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // No live session, but a signup can still be pending confirmation
      // (e.g. Back was pressed before a session existed). Route back to the
      // OTP screen instead of showing the splash as if nothing happened.
      const pendingEmail = getVerifyEmailPending();
      if (pendingEmail) {
        navigate("/verify-email", { replace: true, state: { email: pendingEmail } });
      }
      return;
    }
    // A session can exist for an account that hasn't confirmed its email OTP
    // yet — don't treat that as "already logged in".
    if (!user.email_confirmed_at) {
      navigate("/verify-email", { replace: true, state: { email: user.email } });
      return;
    }
    // Same trap, for an unfinished password reset.
    if (isRecoveryPending(user.id)) {
      navigate("/reset-password", { replace: true });
      return;
    }
    navigate("/home", { replace: true });
  }, [loading, user, navigate]);

  if (loading || user || getVerifyEmailPending()) return null;

  return (
    <SplashScreen
      onGetStarted={() => navigate("/register")}
      onSignIn={() => navigate("/login")}
    />
  );
};

export default Index;
