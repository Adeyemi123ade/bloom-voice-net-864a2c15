import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import {
  activeCallPath,
  getActiveCall,
  isCallFinished,
  startActiveCall,
} from "@/lib/activeCall";

/**
 * /call/:id. Doesn't run the call itself: it registers it with the active
 * call store, and <ActiveCallHost /> draws the call screen over this route.
 * Coming back to this URL for a call that's still running just reopens it.
 */
export default function CallRoute() {
  const { id: conversationId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const callId = params.get("callId");
  const roomName = params.get("room") ?? "";
  const role = (params.get("role") as "caller" | "callee") ?? "caller";
  const initialIsVideo = params.get("type") === "video";

  useEffect(() => {
    if (!conversationId) return;
    if (!callId) {
      navigate(`/chat/${conversationId}`, { replace: true });
      return;
    }
    const active = getActiveCall();
    if (active?.callId === callId) return; // reopening the running call
    if (active) {
      // Never run two calls at once: send the user back to the one in progress.
      toast({ title: "You're already in a call" });
      navigate(activeCallPath(active), { replace: true });
      return;
    }
    if (isCallFinished(callId)) {
      // Stale history entry for a call that has already ended.
      navigate(`/chat/${conversationId}`, { replace: true });
      return;
    }
    startActiveCall({ conversationId, callId, roomName, role, initialIsVideo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, callId]);

  return null;
}
