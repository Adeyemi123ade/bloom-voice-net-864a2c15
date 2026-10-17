import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { activeCallPath, getCallsSnapshot, startActiveCall } from "@/lib/activeCall";
import { clearLiveCall, freshLiveCalls } from "@/lib/liveCallRecord";

/**
 * When ChiChat opens again in the middle of a call (the page reloaded, or
 * Android closed and restarted the app), go straight back into that call.
 * Only a call this phone itself was on a moment ago, and only while it is
 * still on: the call screen joins it again and the other person, who saw
 * "Reconnecting…", carries on talking.
 */
export default function CallRecovery() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const done = useRef(false);

  useEffect(() => {
    if (!user || done.current) return;
    done.current = true;
    const record = freshLiveCalls().sort((a, b) => b.at - a.at)[0];
    if (!record) return;
    (async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("status, caller_id, callee_id")
        .eq("id", record.callId)
        .maybeSingle();
      // Couldn't check (no signal yet): try anyway; the call screen itself
      // leaves at once if the call turns out to be over.
      if (!error) {
        const mine = data && (data.caller_id === user.id || data.callee_id === user.id);
        if (!data || !mine || data.status !== "accepted") {
          clearLiveCall(record.callId);
          return;
        }
      }
      if (getCallsSnapshot().calls.length > 0) return; // already back in a call
      startActiveCall({
        conversationId: record.conversationId,
        callId: record.callId,
        roomName: record.roomName,
        role: record.role,
        initialIsVideo: record.initialIsVideo,
        peer: record.peer,
      });
      if (!pathRef.current.startsWith("/call/")) navigate(activeCallPath(record));
    })();
  }, [user, navigate]);

  return null;
}
