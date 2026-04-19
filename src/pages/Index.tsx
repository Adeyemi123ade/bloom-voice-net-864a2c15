import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import SplashScreen from "./SplashScreen";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate("/home", { replace: true });
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
