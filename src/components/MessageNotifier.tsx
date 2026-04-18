import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

/**
 * Subscribes globally to new messages and shows an in-app toast
 * when a message arrives in a conversation the user participates in,
 * UNLESS the user is currently viewing that conversation.
 */
export default function MessageNotifier() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const myConvIds = useRef<Set<string>>(new Set());
  const currentRoute = useRef(location.pathname);

  useEffect(() => {
    currentRoute.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const refreshConvIds = async () => {
      const { data } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);
      if (cancelled) return;
      myConvIds.current = new Set((data ?? []).map((r) => r.conversation_id));
    };
    refreshConvIds();

    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const m: any = payload.new;
          if (!m || m.sender_id === user.id) return;
          // Refresh memberships if conversation is unknown (new chat just created)
          if (!myConvIds.current.has(m.conversation_id)) {
            await refreshConvIds();
            if (!myConvIds.current.has(m.conversation_id)) return;
          }
          // Skip if already in that chat
          if (currentRoute.current === `/chat/${m.conversation_id}`) return;

          const { data: prof } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", m.sender_id)
            .maybeSingle();

          toast({
            title: prof?.display_name ?? "New message",
            description:
              m.content?.length > 60 ? `${m.content.slice(0, 60)}…` : m.content,
            onClick: () => navigate(`/chat/${m.conversation_id}`),
          } as any);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` },
        () => refreshConvIds(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user, navigate]);

  return null;
}
