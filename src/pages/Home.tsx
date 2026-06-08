import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MessageSquarePlus, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, Mic, Paperclip } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isReallyOnline } from "@/lib/presence";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FILE_PREFIX, parseFileMessage } from "@/components/chat/AttachmentBubble";
import Dialpad from "@/components/Dialpad";

const VOICE_PREFIX = "[voice]";
const CALL_PREFIX = "[call]";

type PreviewKind = "text" | "voice" | "file" | "call";
type Preview = {
  kind: PreviewKind;
  text: string;
  // call-specific
  callType?: "voice" | "video";
  callKind?: string;
  missed?: boolean;
  outgoing?: boolean;
};

function callDurationLabel(seconds?: number) {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function buildPreview(content: string | null, senderId: string | null, myId: string): Preview {
  if (!content) return { kind: "text", text: "" };
  if (content.startsWith(CALL_PREFIX)) {
    const [, body] = content.split(CALL_PREFIX);
    const [type, kind, durationRaw] = (body ?? "").split("|");
    const isVideo = type === "video";
    const outgoing = senderId === myId;
    const durationText = callDurationLabel(Number(durationRaw ?? 0));
    const missed = (kind === "missed" || kind === "no_answer") && !outgoing;
    const declined = kind === "declined" || kind === "rejected";
    let label: string;
    if (missed) {
      label = isVideo ? "Missed video call" : "Missed call";
    } else if (durationText) {
      label = durationText;
    } else if (declined) {
      label = outgoing ? "Call declined" : "Declined call";
    } else {
      label = isVideo ? "Video call" : "Voice call";
    }
    return { kind: "call", text: label, callType: isVideo ? "video" : "voice", callKind: kind, missed, outgoing };
  }
  if (content.startsWith(VOICE_PREFIX)) return { kind: "voice", text: "Voice note" };
  if (content.startsWith(FILE_PREFIX)) {
    const meta = parseFileMessage(content);
    if (meta) {
      if (meta.mime.startsWith("image/")) return { kind: "file", text: meta.caption || "Photo" };
      if (meta.mime.startsWith("video/")) return { kind: "file", text: meta.caption || "Video" };
      return { kind: "file", text: meta.name || "File" };
    }
    return { kind: "file", text: "Attachment" };
  }
  // strip reply-quote prefix "> ...\n"
  const cleaned = content.startsWith("> ")
    ? content.split("\n").slice(1).join("\n").trim() || content
    : content;
  return { kind: "text", text: cleaned };
}

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string;
  show_last_seen?: boolean | null;
};

type ChatRow = {
  conversation_id: string;
  other: Profile;
  last_message: string | null;
  last_sender_id: string | null;
  last_message_at: string;
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return "Yesterday";
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Home() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [openNew, setOpenNew] = useState(false);
  const [dialpadOpen, setDialpadOpen] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    document.title = "Chats — Chichat";
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  // Daily auto-backup on app open (once per day, silent)
  useEffect(() => {
    if (!user) return;
    import("@/lib/chatBackup").then((m) => m.maybeRunDailyBackup());
  }, [user]);

  // Note: backup-restore prompt removed — restore is now manual from Settings.

  // Mark online + heartbeat
  useEffect(() => {
    if (!user) return;
    const setOnline = (online: boolean) =>
      supabase
        .from("profiles")
        .update({ is_online: online, last_seen_at: new Date().toISOString() })
        .eq("id", user.id);
    setOnline(true);
    const interval = setInterval(() => setOnline(true), 30000);
    const onUnload = () => setOnline(false);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onUnload);
      setOnline(false);
    };
  }, [user]);

  const loadChats = async () => {
    if (!user) return;
    setFetching(true);
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);
    const convIds = (parts ?? []).map((p) => p.conversation_id);
    if (convIds.length === 0) {
      setChats([]);
      setFetching(false);
      return;
    }
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, last_message_at")
      .in("id", convIds)
      .order("last_message_at", { ascending: false });

    const { data: others } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds)
      .neq("user_id", user.id);

    const otherIds = Array.from(new Set((others ?? []).map((o) => o.user_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, is_online, last_seen_at, show_last_seen")
      .in("id", otherIds.length ? otherIds : ["00000000-0000-0000-0000-000000000000"]);

    const { data: lastMsgs } = await supabase
      .from("messages")
      .select("conversation_id, content, created_at, sender_id")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false });

    const lastByConv = new Map<string, { content: string; created_at: string; sender_id: string }>();
    (lastMsgs ?? []).forEach((m) => {
      if (!lastByConv.has(m.conversation_id))
        lastByConv.set(m.conversation_id, { content: m.content, created_at: m.created_at, sender_id: m.sender_id });
    });

    const profById = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
    const otherByConv = new Map<string, string>();
    (others ?? []).forEach((o) => otherByConv.set(o.conversation_id, o.user_id));

    const rows: ChatRow[] = (convs ?? [])
      .map((c) => {
        const otherId = otherByConv.get(c.id);
        const other = otherId ? profById.get(otherId) : undefined;
        if (!other) return null;
        const lm = lastByConv.get(c.id);
        return {
          conversation_id: c.id,
          other,
          last_message: lm?.content ?? null,
          last_sender_id: lm?.sender_id ?? null,
          last_message_at: lm?.created_at ?? c.last_message_at,
        };
      })
      .filter(Boolean) as ChatRow[];

    setChats(rows);
    setFetching(false);
  };

  useEffect(() => {
    if (user) loadChats();
  }, [user]);

  // Realtime: refresh on new messages or profile presence changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("home-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () =>
        loadChats(),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () =>
        loadChats(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadPeople = async (search?: string) => {
    if (!user) return;
    const q = (search ?? "").trim();
    let qb = supabase
      .from("profiles")
      .select("id, display_name, avatar_url, is_online, last_seen_at, show_last_seen")
      .neq("id", user.id);
    if (q) {
      const digits = q.replace(/\D/g, "");
      const escaped = q.replace(/[%,()]/g, " ");
      const orParts = [`display_name.ilike.%${escaped}%`];
      if (digits.length >= 3) orParts.push(`phone.ilike.%${digits}%`);
      qb = qb.or(orParts.join(","));
    }
    const { data } = await qb.order("display_name", { ascending: true }).limit(100);
    setPeople((data ?? []) as Profile[]);
  };

  const startChat = async (otherId: string) => {
    if (!user) return;
    const { data, error } = await supabase.rpc("start_direct_conversation", {
      _other_user: otherId,
    });
    if (error || !data) {
      toast({ title: "Could not start chat", description: error?.message, variant: "destructive" });
      return;
    }
    setOpenNew(false);
    await loadChats();
    navigate(`/chat/${data}`);
  };

  const [peopleQuery, setPeopleQuery] = useState("");
  useEffect(() => {
    if (!openNew) return;
    const t = setTimeout(() => { loadPeople(peopleQuery); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleQuery, openNew]);
  const filteredPeople = people;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) =>
        c.other.display_name?.toLowerCase().includes(q) ||
        (c.last_message && buildPreview(c.last_message, c.last_sender_id, user?.id ?? "").text.toLowerCase().includes(q)),
    );
  }, [chats, query, user]);


  return (
    <MobileFrame bottomNav="messages">
      <div className="h-full w-full flex flex-col bg-background">
        {/* Header */}
        <div className="px-4 pt-5 pb-3 flex items-center justify-between">
          <h1 className="text-[20px] font-bold text-foreground">Chats</h1>
          <Dialog open={openNew} onOpenChange={(o) => { setOpenNew(o); if (o) { setPeopleQuery(""); loadPeople(); } }}>
            <DialogTrigger asChild>
              <button
                aria-label="Start new chat"
                className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition"
              >
                <MessageSquarePlus className="w-5 h-5" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-[320px] bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-sm">Start a new chat</DialogTitle>
              </DialogHeader>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  value={peopleQuery}
                  onChange={(e) => setPeopleQuery(e.target.value)}
                  placeholder="Search contacts"
                  className="h-8 pl-8 text-xs bg-input border-border"
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto -mx-2 mt-1">
                {filteredPeople.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                    {people.length === 0 ? "No other users yet." : "No contacts match."}
                  </p>
                )}
                {filteredPeople.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => startChat(p.id)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-secondary text-left"
                  >
                    <div className="relative">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={p.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">
                          {initials(p.display_name)}
                        </AvatarFallback>
                      </Avatar>
                      {isReallyOnline(p) && (
                        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-accent border border-card" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {p.display_name ?? "Unknown"}
                      </p>
                      {isReallyOnline(p) && (
                        <p className="text-2xs text-muted-foreground">online</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats and contacts"
              className="h-8 pl-8 text-xs bg-input border-border"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {fetching && (
            <p className="text-xs text-muted-foreground text-center mt-6">Loading…</p>
          )}
          {!fetching && filtered.length === 0 && (
            <div className="text-center mt-10 px-6">
              <p className="text-xs font-semibold text-foreground">
                {query ? "No matches" : "No chats yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {query ? "Try a different name." : "Tap the new chat icon to start a conversation."}
              </p>
              <Button
                onClick={() => { setOpenNew(true); setPeopleQuery(query); loadPeople(); }}
                className="mt-4 h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
              >
                {query ? "Search contacts" : "Start chatting"}
              </Button>
            </div>
          )}
          {filtered.map((c) => {
            const preview = buildPreview(c.last_message, c.last_sender_id, user?.id ?? "");
            let PreviewIcon: typeof Phone | null = null;
            let iconClass = "text-muted-foreground";
            if (preview.kind === "call") {
              PreviewIcon = preview.missed
                ? PhoneMissed
                : preview.callType === "video"
                  ? Video
                  : preview.outgoing
                    ? PhoneOutgoing
                    : PhoneIncoming;
              iconClass = preview.missed ? "text-destructive" : "text-primary";
            } else if (preview.kind === "voice") {
              PreviewIcon = Mic;
            } else if (preview.kind === "file") {
              PreviewIcon = Paperclip;
            }
            return (
            <button
              key={c.conversation_id}
              onClick={() => navigate(`/chat/${c.conversation_id}`)}
              className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-secondary text-left transition-colors"
            >
              <div className="relative shrink-0">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={c.other.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">
                    {initials(c.other.display_name)}
                  </AvatarFallback>
                </Avatar>
                {isReallyOnline(c.other) && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent border-2 border-background" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {c.other.display_name ?? "Unknown"}
                  </p>
                  <span className="text-2xs text-muted-foreground shrink-0">
                    {timeAgo(c.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5 min-w-0 pr-10">
                  {PreviewIcon && (
                    <PreviewIcon className={`w-3 h-3 shrink-0 ${iconClass}`} />
                  )}
                  <p className={`text-xs truncate ${preview.kind === "call" && preview.missed ? "text-destructive" : "text-muted-foreground"}`}>
                    {preview.text || (isReallyOnline(c.other) ? "online" : "")}
                  </p>
                </div>
              </div>
            </button>
            );
          })}
        </div>
      </div>
      <Dialpad open={dialpadOpen} onOpenChange={setDialpadOpen} />
    </MobileFrame>
  );
}
