import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { rememberPage } from "@/lib/feedback";

/** Remembers the last screen, so feedback says where the person was. */
export default function RouteMemory() {
  const { pathname } = useLocation();
  useEffect(() => {
    rememberPage(pathname);
  }, [pathname]);
  return null;
}
