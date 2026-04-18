import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MessageSquarePlus, LogOut } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string;
};

type ChatRow = {
  conversation_id: string;
  other: Profile;
  last_message: string | null;
  last_message_at: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
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
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    document.title = "Chats — Chichat";
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

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
      .select("id, display_name, avatar_url, is_online, last_seen_at")
      .in("id", otherIds.length ? otherIds : ["00000000-0000-0000-0000-000000000000"]);

    const { data: lastMsgs } = await supabase
      .from("messages")
      .select("conversation_id, content, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false });

    const lastByConv = new Map<string, { content: string; created_at: string }>();
    (lastMsgs ?? []).forEach((m) => {
      if (!lastByConv.has(m.conversation_id))
        lastByConv.set(m.conversation_id, { content: m.content, created_at: m.created_at });
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

  const loadPeople = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, is_online, last_seen_at")
      .neq("id", user.id)
      .order("display_name", { ascending: true })
      .limit(50);
    setPeople((data ?? []) as Profile[]);
  };

  const startChat = async (otherId: string) => {
    if (!user) return;
    // Find existing 1:1
    const { data: mine } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);
    const myConvs = (mine ?? []).map((m) => m.conversation_id);
    let conversationId: string | null = null;
    if (myConvs.length) {
      const { data: shared } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", otherId)
        .in("conversation_id", myConvs);
      if (shared && shared.length) conversationId = shared[0].conversation_id;
    }
    if (!conversationId) {
      const { data: conv, error } = await supabase
        .from("conversations")
        .insert({})
        .select("id")
        .single();
      if (error || !conv) {
        toast({ title: "Could not start chat", description: error?.message, variant: "destructive" });
        return;
      }
      conversationId = conv.id;
      const { error: pErr } = await supabase
        .from("conversation_participants")
        .insert([
          { conversation_id: conversationId, user_id: user.id },
          { conversation_id: conversationId, user_id: otherId },
        ]);
      if (pErr) {
        toast({ title: "Could not add participants", description: pErr.message, variant: "destructive" });
        return;
      }
    }
    setOpenNew(false);
    await loadChats();
    // Future: navigate to /chat/:id
    toast({ title: "Chat ready", description: "Chat room screen coming up next." });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) =>
        c.other.display_name?.toLowerCase().includes(q) ||
        c.last_message?.toLowerCase().includes(q),
    );
  }, [chats, query]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background">
        {/* Header */}
        <div className="px-4 pt-5 pb-3 flex items-center justify-between">
          <h1 className="text-[20px] font-bold text-foreground">Chats</h1>
          <div className="flex items-center gap-1.5">
            <Dialog open={openNew} onOpenChange={(o) => { setOpenNew(o); if (o) loadPeople(); }}>
              <DialogTrigger asChild>
                <button
                  aria-label="New chat"
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
                >
                  <MessageSquarePlus className="w-4 h-4 text-foreground" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-[300px] bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-sm">Start a new chat</DialogTitle>
                </DialogHeader>
                <div className="max-h-[300px] overflow-y-auto -mx-2">
                  {people.length === 0 && (
                    <p className="text-[11px] text-muted-foreground px-2 py-3">
                      No other users yet. Invite a friend to sign up!
                    </p>
                  )}
                  {people.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => startChat(p.id)}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-secondary text-left"
                    >
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-semibold text-foreground">
                          {initials(p.display_name)}
                        </div>
                        {p.is_online && (
                          <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-accent border border-card" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {p.display_name ?? "Unknown"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {p.is_online ? "online" : `last seen ${timeAgo(p.last_seen_at)}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <button
              aria-label="Sign out"
              onClick={signOut}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
            >
              <LogOut className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations"
              className="h-8 pl-8 text-xs bg-input border-border"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {fetching && (
            <p className="text-[11px] text-muted-foreground text-center mt-6">Loading…</p>
          )}
          {!fetching && filtered.length === 0 && (
            <div className="text-center mt-10 px-6">
              <p className="text-xs font-semibold text-foreground">No chats yet</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Tap the new chat icon to start a conversation.
              </p>
              <Button
                onClick={() => { setOpenNew(true); loadPeople(); }}
                className="mt-4 h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
              >
                Start chatting
              </Button>
            </div>
          )}
          {filtered.map((c) => (
            <button
              key={c.conversation_id}
              className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-secondary text-left transition-colors"
            >
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-foreground">
                  {initials(c.other.display_name)}
                </div>
                {c.other.is_online && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent border-2 border-background" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {c.other.display_name ?? "Unknown"}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {timeAgo(c.last_message_at)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {c.last_message ?? (c.other.is_online ? "online" : `last seen ${timeAgo(c.other.last_seen_at)}`)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </MobileFrame>
  );
}
