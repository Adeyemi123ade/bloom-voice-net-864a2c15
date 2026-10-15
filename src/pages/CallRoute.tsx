import { useEffect } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  activeCallPath,
  canAddHeldCall,
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
  const location = useLocation();
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
    // A second call is only taken when it's an answered waiting call and the
    // first call is on hold. Otherwise go quietly back to the call in progress.
    if (active && !(role === "callee" && canAddHeldCall())) {
      navigate(activeCallPath(active), { replace: true });
      return;
    }
    if (isCallFinished(callId)) {
      // Stale history entry for a call that has already ended.
      navigate(`/chat/${conversationId}`, { replace: true });
      return;
    }
    // The screen that started the call may pass who's on the other end, so
    // the call screen shows their name and photo straight away.
    const peer = (location.state as { peer?: { name: string; avatarUrl?: string | null } } | null)?.peer;
    startActiveCall({ conversationId, callId, roomName, role, initialIsVideo, peer });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, callId]);

  return null;
}
