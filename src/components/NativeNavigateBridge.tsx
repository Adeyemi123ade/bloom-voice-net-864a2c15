import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

declare global {
  interface Window {
    __chichatNavigate?: (path: string) => void;
  }
}

/**
 * Lets the Android app open a screen (an answered call) inside the running
 * app, instead of reloading the whole app, which is slow.
 */
export default function NativeNavigateBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    window.__chichatNavigate = (path: string) => {
      if (typeof path === "string" && path.startsWith("/")) navigate(path);
    };
    return () => {
      delete window.__chichatNavigate;
    };
  }, [navigate]);
  return null;
}
