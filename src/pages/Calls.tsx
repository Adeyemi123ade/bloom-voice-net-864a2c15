import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Grid3x3 } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { clearPreparedCallMedia, formatCallMediaError, prepareCallMedia } from "@/lib/callMedia";
import CallBackSheet from "@/components/call/CallBackSheet";
import Dialpad from "@/components/Dialpad";

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
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

/**
 * Per-side label rules:
 *  - Caller side (outgoing):
 *      ringing/missed-no-answer  → "No answer"
 *      declined                  → "Call rejected"
 *      ended/accepted (no dur)   → "Call ended"
 *      ended (with dur)          → "Voice/Video call ended"
 *  - Receiver side (incoming):
 *      ringing/missed            → "Missed voice/video call"
 *      declined (by me)          → "Call ended"
 *      ended/accepted            → "Received call"
 */
function labelFor(c: Call, outgoing: boolean): { label: string; missed: boolean } {
  const isVideo = c.call_type === "video";
  if (outgoing) {
    if (c.status === "ringing" || c.status === "missed") return { label: "No answer", missed: true };
    if (c.status === "declined") return { label: "Call rejected", missed: false };
    return { label: isVideo ? "Video call ended" : "Voice call ended", missed: false };
  }
  if (c.status === "ringing" || c.status === "missed")
    return { label: isVideo ? "Missed video call" : "Missed voice call", missed: true };
  if (c.status === "declined") return { label: "Call ended", missed: false };
  return { label: "Received call", missed: false };
}

export default function Calls() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [calls, setCalls] = useState<Call[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [fetching, setFetching] = useState(true);
  const [sheet, setSheet] = useState<{ name: string; type: "voice" | "video"; run: () => void } | null>(null);
  const [dialOpen, setDialOpen] = useState(false);

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
      const { label, missed } = labelFor(c, outgoing);
      const dur =
        c.ended_at && (c.status === "ended" || c.status === "accepted")
          ? Math.max(0, Math.floor((new Date(c.ended_at).getTime() - new Date(c.created_at).getTime()) / 1000))
          : 0;
      return { c, outgoing, other, label, missed, dur };
    });
  }, [calls, profiles, user]);

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background relative">
        <div className="px-3 pt-4 pb-3 border-b border-border flex items-center justify-between">
          <h1 className="text-[17px] font-bold text-foreground">Calls</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
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
          {items.map(({ c, outgoing, other, label, missed }) => {
            const Icon = missed ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
            const TypeIcon = c.call_type === "video" ? Video : Phone;
            const name = other?.display_name ?? "Unknown";
            const datetime = whenLabel(c.created_at);

            const doCall = async () => {
              try {
                await prepareCallMedia(c.call_type === "video");
              } catch (error) {
                toast({
                  title: "Call permission needed",
                  description: formatCallMediaError(error, c.call_type === "video"),
                  variant: "destructive",
                });
                return;
              }
              const room = `chichat-${c.conversation_id}-${Date.now()}`;
              const { data, error } = await supabase
                .from("calls")
                .insert({
                  conversation_id: c.conversation_id,
                  caller_id: user!.id,
                  callee_id: other?.id ?? (outgoing ? c.callee_id : c.caller_id),
                  room_name: room,
                  call_type: c.call_type,
                })
                .select("id")
                .single();
              if (error || !data) {
                clearPreparedCallMedia();
                if (error) {
                  toast({ title: "Could not start call", description: error.message, variant: "destructive" });
                }
                return;
              }
              navigate(
                `/call/${c.conversation_id}?type=${c.call_type}&callId=${data.id}&room=${encodeURIComponent(room)}&role=caller`,
              );
            };
            const callBack = () =>
              setSheet({ name, type: c.call_type === "video" ? "video" : "voice", run: doCall });

            return (
              <div
                key={c.id}
                className="w-full flex items-center gap-3 px-1 py-2 hover:bg-secondary/60 transition-colors"
              >
                <Avatar className="w-12 h-12 shrink-0">
                  <AvatarImage src={other?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => navigate(`/chat/${c.conversation_id}`)}
                  className="flex-1 min-w-0 text-left"
                  aria-label={`${label} with ${name}`}
                >
                  {/* Line 1: name */}
                  <div className={`text-[15px] font-semibold truncate ${missed ? "text-destructive" : "text-foreground"}`}>
                    {name}
                  </div>
                  {/* Line 2: arrow icon + datetime */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${missed ? "text-destructive" : "text-primary"}`} />
                    <span className="text-[12px] text-muted-foreground truncate">
                      {datetime}
                    </span>
                  </div>
                </button>
                <button
                  aria-label="Call back"
                  onClick={callBack}
                  className="w-10 h-10 rounded-full hover:bg-secondary flex items-center justify-center shrink-0"
                >
                  <TypeIcon className="w-5 h-5 text-primary" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          aria-label="Open dialer"
          onClick={() => setDialOpen(true)}
          className="absolute bottom-4 right-4 w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg flex items-center justify-center"
        >
          <Grid3x3 className="w-6 h-6" />
        </button>
      </div>
      <CallBackSheet
        open={!!sheet}
        onOpenChange={(o) => !o && setSheet(null)}
        name={sheet?.name ?? ""}
        type={sheet?.type ?? "voice"}
        onConfirm={() => sheet?.run()}
      />
      <Dialpad open={dialOpen} onOpenChange={setDialOpen} />
    </MobileFrame>
  );
}
