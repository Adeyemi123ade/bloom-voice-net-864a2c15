import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isRecoveryPending } from "@/lib/recoveryPending";
import SplashScreen from "./SplashScreen";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;
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

  if (loading || user) return null;

  return (
    <SplashScreen
      onGetStarted={() => navigate("/register")}
      onSignIn={() => navigate("/login")}
    />
  );
};

export default Index;
