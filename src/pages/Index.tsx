import { useNavigate } from "react-router-dom";
import SplashScreen from "./SplashScreen";

const Index = () => {
  const navigate = useNavigate();
  return (
    <SplashScreen
      onGetStarted={() => navigate("/register")}
      onSignIn={() => navigate("/login")}
    />
  );
};

export default Index;
