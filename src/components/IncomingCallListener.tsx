import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

/**
 * Listens globally for incoming calls (rows in `calls` where I'm the callee
 * and status='ringing'). Shows a toast with Accept/Decline.
 */
export default function IncomingCallListener() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const handle = async (callId: string) => {
      if (handled.current.has(callId)) return;
      handled.current.add(callId);

      const { data: call } = await supabase
        .from("calls")
        .select("id, conversation_id, caller_id, room_name, call_type, status")
        .eq("id", callId)
        .maybeSingle();
      if (!call || call.status !== "ringing") return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", call.caller_id)
        .maybeSingle();

      toast({
        title: `Incoming ${call.call_type} call`,
        description: prof?.display_name ?? "Someone is calling…",
        duration: 30000,
        onClick: () => {
          navigate(
            `/call/${call.conversation_id}?type=${call.call_type}&callId=${call.id}&room=${encodeURIComponent(
              call.room_name,
            )}&role=callee`,
          );
        },
      } as any);
    };

    const ch = supabase
      .channel(`calls-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `callee_id=eq.${user.id}`,
        },
        (payload) => {
          const row: any = payload.new;
          if (row?.status === "ringing") handle(row.id);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, navigate]);

  return null;
}
