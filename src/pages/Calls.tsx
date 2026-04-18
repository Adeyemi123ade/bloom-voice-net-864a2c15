import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, MessageCircle } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Call = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  call_type: string;
  status: string;
  created_at: string;
  ended_at: string | null;
};

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function whenLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Calls() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [calls, setCalls] = useState<Call[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    document.title = "Calls — Chichat";
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setFetching(true);
      const { data } = await supabase
        .from("calls")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      const list = (data ?? []) as Call[];
      setCalls(list);
      const ids = Array.from(
        new Set(list.flatMap((c) => [c.caller_id, c.callee_id]).filter((x) => x !== user.id)),
      );
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", ids);
        setProfiles(new Map((profs ?? []).map((p) => [p.id, p as Profile])));
      }
      setFetching(false);
    })();
  }, [user]);

  const items = useMemo(() => {
    if (!user) return [];
    return calls.map((c) => {
      const outgoing = c.caller_id === user.id;
      const otherId = outgoing ? c.callee_id : c.caller_id;
      const other = profiles.get(otherId);
      const missed = !outgoing && (c.status === "ringing" || c.status === "declined");
      return { c, outgoing, other, missed };
    });
  }, [calls, profiles, user]);

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background">
        <div className="px-3 pt-4 pb-3 flex items-center gap-2 border-b border-border">
          <button
            aria-label="Back"
            onClick={() => navigate("/home")}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <h1 className="text-[17px] font-bold text-foreground">Calls</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {fetching && (
            <p className="text-[11px] text-muted-foreground text-center mt-6">Loading…</p>
          )}
          {!fetching && items.length === 0 && (
            <div className="text-center mt-10 px-6">
              <p className="text-xs font-semibold text-foreground">No calls yet</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Your call history will appear here.
              </p>
            </div>
          )}
          {items.map(({ c, outgoing, other, missed }) => {
            const Icon = missed ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
            const iconColor = missed
              ? "text-destructive"
              : outgoing
                ? "text-muted-foreground"
                : "text-primary";
            return (
              <div
                key={c.id}
                className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-secondary"
              >
                <Avatar className="w-10 h-10 shrink-0">
                  <AvatarImage src={other?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">
                    {initials(other?.display_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold truncate ${missed ? "text-destructive" : "text-foreground"}`}>
                    {other?.display_name ?? "Unknown"}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Icon className={`w-3 h-3 ${iconColor}`} />
                    <span className="text-[10px] text-muted-foreground">
                      {c.call_type === "video" ? "Video" : "Voice"} · {whenLabel(c.created_at)}
                    </span>
                  </div>
                </div>
                <button
                  aria-label="Open chat"
                  onClick={() => navigate(`/chat/${c.conversation_id}`)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-background"
                >
                  <MessageCircle className="w-4 h-4 text-foreground" />
                </button>
                <button
                  aria-label="Call back"
                  onClick={() => {
                    const room = `chichat-${c.conversation_id}-${Date.now()}`;
                    supabase
                      .from("calls")
                      .insert({
                        conversation_id: c.conversation_id,
                        caller_id: user!.id,
                        callee_id: other?.id ?? (outgoing ? c.callee_id : c.caller_id),
                        room_name: room,
                        call_type: c.call_type,
                      })
                      .select("id")
                      .single()
                      .then(({ data, error }) => {
                        if (error || !data) return;
                        navigate(
                          `/call/${c.conversation_id}?type=${c.call_type}&callId=${data.id}&room=${encodeURIComponent(room)}&role=caller`,
                        );
                      });
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-background"
                >
                  {c.call_type === "video" ? (
                    <Video className="w-4 h-4 text-primary" />
                  ) : (
                    <Phone className="w-4 h-4 text-primary" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </MobileFrame>
  );
}
