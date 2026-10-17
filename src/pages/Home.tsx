import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { buildPreview } from "@/lib/chat/messageKinds";
import {
  type ChatRow as ChatListRow,
  type MessageLike,
  applyNewMessage,
  applyProfile,
  loadChatList,
  loadChatSummary,
  sortChats,
  updateMatters,
} from "@/lib/chat/chatList";
import Dialpad from "@/components/Dialpad";
import { runFirstStartSetup } from "@/lib/appSettings";

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string;
  show_last_seen?: boolean | null;
};

type ChatRow = ChatListRow;

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
  const location = useLocation();
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

  // Contacts.tsx links here to open this same "Start a new chat" search
  // (search_users) instead of duplicating it — see the "Search ChiChat"
  // entry point on the Contacts screen.
  useEffect(() => {
    const state = location.state as { openNewChat?: boolean } | null;
    if (!state?.openNewChat) return;
    setOpenNew(true);
    setPeopleQuery("");
    void loadPeople();
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // First start on Android: ask once to run in the background, so calls
  // ring with the app closed.
  useEffect(() => {
    if (user) void runFirstStartSetup();
  }, [user]);

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

  // Full reloads are rare now (first open, a new chat, coming back to the
  // app); only the newest one may write state, so a slower earlier reload
  // can't bring back a cleared badge.
  const loadSeq = useRef(0);
  const chatsRef = useRef<ChatRow[]>([]);
  chatsRef.current = chats;
  const loadChats = async () => {
    if (!user) return;
    const seq = ++loadSeq.current;
    const rows = await loadChatList(user.id);
    if (seq !== loadSeq.current) return;
    setChats(rows);
    setFetching(false);
  };
  // Bursts (several messages arriving together) collapse into one reload.
  const reloadTimer = useRef<number | null>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      void loadChats();
    }, 300);
  };
  // One chat's preview and badge, refreshed after an edit, delete or read.
  // Marking a chat read updates many messages at once: one refresh per chat.
  const refreshTimers = useRef(new Map<string, number>());
  const scheduleChatRefresh = (conversationId: string) => {
    const timers = refreshTimers.current;
    const t = timers.get(conversationId);
    if (t) window.clearTimeout(t);
    timers.set(
      conversationId,
      window.setTimeout(async () => {
        timers.delete(conversationId);
        if (!user) return;
        const seq = loadSeq.current;
        const summary = await loadChatSummary(conversationId, user.id);
        if (seq !== loadSeq.current) return; // a full reload replaced the list meanwhile
        setChats((prev) =>
          sortChats(
            prev.map((r) =>
              r.conversation_id === conversationId
                ? { ...r, ...summary, last_message_at: summary.last_message_at ?? r.last_message_at }
                : r,
            ),
          ),
        );
      }, 250),
    );
  };

  useEffect(() => {
    if (user) loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime: each change updates only the chat it belongs to. A presence
  // heartbeat (every contact, every 30 s) used to reload the whole list;
  // now it just updates that person's online dot.
  useEffect(() => {
    if (!user) return;
    let joinedBefore = false;
    const channel = supabase
      .channel("home-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as MessageLike;
        if (!m?.conversation_id) return scheduleReload();
        const next = applyNewMessage(chatsRef.current, m, user.id);
        if (next === null) scheduleReload(); // a chat that isn't listed yet
        else setChats(next);
      })
      // Read (here or on another device), edited or deleted for everyone.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as MessageLike;
        if (!m?.conversation_id) return;
        if (updateMatters(chatsRef.current, m, user.id)) scheduleChatRefresh(m.conversation_id);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const p = payload.new as { id?: string };
        if (p?.id) setChats((prev) => applyProfile(prev, p as { id: string }));
      })
      .subscribe((status) => {
        // A rejoin after a dropped connection may have missed changes.
        if (status === "SUBSCRIBED") {
          if (joinedBefore) scheduleReload();
          joinedBefore = true;
        }
      });
    // Back from the background, or the network came back: catch up once.
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 15000) scheduleReload();
    };
    const onOnline = () => scheduleReload();
    const refreshes = refreshTimers.current;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      refreshes.forEach((t) => window.clearTimeout(t));
      refreshes.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadPeople = async (search?: string) => {
    if (!user) return;
    const q = (search ?? "").trim();
    const { data, error } = await supabase.rpc("search_users", {
      _query: q,
      _limit: 100,
    });
    if (error) {
      setPeople([]);
      return;
    }
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
          {fetching && chats.length === 0 && (
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
                  <span className={`text-2xs shrink-0 ${c.unread > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                    {timeAgo(c.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5 min-w-0">
                  {PreviewIcon && (
                    <PreviewIcon className={`w-3 h-3 shrink-0 ${iconClass}`} />
                  )}
                  <p className={`text-xs truncate min-w-0 ${preview.kind === "call" && preview.missed ? "text-destructive" : "text-muted-foreground"}`}>
                    {preview.text || (isReallyOnline(c.other) ? "online" : "")}
                  </p>
                  <span className="flex-1" />
                  {c.unread > 0 && (
                    <span
                      aria-label={`${c.unread} unread message${c.unread === 1 ? "" : "s"}`}
                      className="ml-2 shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold leading-5 text-center tabular-nums"
                    >
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  )}
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
