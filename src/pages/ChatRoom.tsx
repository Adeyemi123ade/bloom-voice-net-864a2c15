import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send, Check, CheckCheck, Phone, Video, Mic, Square, Trash2, Pencil, X, Play, Pause } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  edited_at: string | null;
  deleted_for_everyone: boolean;
};

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string;
};

const HIDE_KEY = (cid: string) => `chichat:hidden:${cid}`;

function loadHidden(cid: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDE_KEY(cid)) ?? "[]"));
  } catch {
    return new Set();
  }
}
function saveHidden(cid: string, set: Set<string>) {
  localStorage.setItem(HIDE_KEY(cid), JSON.stringify(Array.from(set)));
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

const VOICE_PREFIX = "[voice]";

function VoiceBubble({ url, mine }: { url: string; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [pos, setPos] = useState(0);

  useEffect(() => {
    const a = new Audio(url);
    audioRef.current = a;
    a.addEventListener("loadedmetadata", () => setDur(Math.floor(a.duration || 0)));
    a.addEventListener("timeupdate", () => setPos(Math.floor(a.currentTime)));
    a.addEventListener("ended", () => {
      setPlaying(false);
      setPos(0);
    });
    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, [url]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play();
      setPlaying(true);
    }
  };

  const pct = dur ? (pos / dur) * 100 : 0;

  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <button
        onClick={toggle}
        className={`w-7 h-7 rounded-full flex items-center justify-center ${
          mine ? "bg-primary-foreground/20" : "bg-foreground/10"
        }`}
      >
        {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      </button>
      <div className={`flex-1 h-1 rounded-full ${mine ? "bg-primary-foreground/30" : "bg-foreground/20"}`}>
        <div
          className={`h-full rounded-full ${mine ? "bg-primary-foreground" : "bg-foreground"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[9px] ${mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
        {fmtDuration(playing || pos ? pos : dur)}
      </span>
    </div>
  );
}

export default function ChatRoom() {
  const { id: conversationId } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Profile | null>(null);
  const [text, setText] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Message | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recTimer = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    document.title = other?.display_name ? `${other.display_name} — Chichat` : "Chat — Chichat";
  }, [other]);

  useEffect(() => {
    if (conversationId) setHidden(loadHidden(conversationId));
  }, [conversationId]);

  useEffect(() => {
    if (!user || !conversationId) return;
    (async () => {
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", user.id);
      const otherId = parts?.[0]?.user_id;
      if (otherId) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, is_online, last_seen_at")
          .eq("id", otherId)
          .maybeSingle();
        if (prof) setOther(prof as Profile);
      }
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      setMessages((msgs ?? []) as Message[]);
    })();
  }, [user, conversationId]);

  useEffect(() => {
    if (!user || !conversationId) return;
    const unread = messages.filter((m) => m.sender_id !== user.id && !m.read_at);
    if (unread.length === 0) return;
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread.map((m) => m.id))
      .then(() => {});
  }, [messages, user, conversationId]);

  useEffect(() => {
    if (!user || !conversationId) return;
    const ch = supabase
      .channel(`room-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message]),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const old: any = payload.old;
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "typing_indicators", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (!row || row.user_id === user.id) return;
          if (payload.eventType === "DELETE") {
            setOtherTyping(false);
            return;
          }
          const ageMs = Date.now() - new Date(row.updated_at).getTime();
          setOtherTyping(ageMs < 5000);
          window.setTimeout(() => setOtherTyping(false), 4000);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: other ? `id=eq.${other.id}` : undefined },
        (payload) => setOther((p) => (p ? ({ ...p, ...(payload.new as any) } as Profile) : p)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, conversationId, other?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, otherTyping]);

  const send = async () => {
    if (!user || !conversationId) return;
    const content = text.trim();
    if (!content) return;
    setText("");

    if (editing) {
      const { error } = await supabase
        .from("messages")
        .update({ content, edited_at: new Date().toISOString() })
        .eq("id", editing.id);
      if (error) toast({ title: "Edit failed", description: error.message, variant: "destructive" });
      setEditing(null);
      return;
    }

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
    });
    if (error) {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("typing_indicators").delete().eq("conversation_id", conversationId).eq("user_id", user.id);
  };

  const onType = async (v: string) => {
    setText(v);
    if (!user || !conversationId || editing) return;
    await supabase
      .from("typing_indicators")
      .upsert({ conversation_id: conversationId, user_id: user.id, updated_at: new Date().toISOString() });
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
    typingTimeout.current = window.setTimeout(async () => {
      await supabase.from("typing_indicators").delete().eq("conversation_id", conversationId).eq("user_id", user.id);
    }, 3000);
  };

  // Edit & delete
  const startEdit = (m: Message) => {
    setEditing(m);
    setText(m.content);
  };
  const cancelEdit = () => {
    setEditing(null);
    setText("");
  };
  const deleteForMe = (m: Message) => {
    if (!conversationId) return;
    const next = new Set(hidden);
    next.add(m.id);
    setHidden(next);
    saveHidden(conversationId, next);
  };
  const deleteForEveryone = async (m: Message) => {
    const { error } = await supabase
      .from("messages")
      .update({ deleted_for_everyone: true, content: "" })
      .eq("id", m.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
  };

  // Voice notes
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recChunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && recChunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimer.current) window.clearInterval(recTimer.current);
        const blob = new Blob(recChunks.current, { type: "audio/webm" });
        await uploadVoice(blob);
        setRecSec(0);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecSec(0);
      recTimer.current = window.setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch (e: any) {
      toast({ title: "Microphone blocked", description: e.message, variant: "destructive" });
    }
  };
  const stopRecording = (cancel = false) => {
    const r = recorderRef.current;
    if (!r) return;
    if (cancel) {
      r.onstop = () => {
        r.stream.getTracks().forEach((t) => t.stop());
        if (recTimer.current) window.clearInterval(recTimer.current);
        setRecSec(0);
      };
    }
    r.stop();
    setRecording(false);
  };
  const uploadVoice = async (blob: Blob) => {
    if (!user || !conversationId) return;
    const path = `${user.id}/${conversationId}/${Date.now()}.webm`;
    const { error: upErr } = await supabase.storage
      .from("chat-media")
      .upload(path, blob, { contentType: "audio/webm" });
    if (upErr) {
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: `${VOICE_PREFIX}${pub.publicUrl}`,
    });
    if (error) toast({ title: "Send failed", description: error.message, variant: "destructive" });
  };

  const visible = useMemo(() => messages.filter((m) => !hidden.has(m.id)), [messages, hidden]);

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background">
        {/* Header */}
        <div className="px-3 pt-4 pb-3 flex items-center gap-2 border-b border-border">
          <button
            aria-label="Back"
            onClick={() => navigate("/home")}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="relative">
            <Avatar className="w-9 h-9">
              <AvatarImage src={other?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/20 text-foreground text-[11px] font-semibold">
                {initials(other?.display_name)}
              </AvatarFallback>
            </Avatar>
            {other?.is_online && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent border-2 border-background" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {other?.display_name ?? "Chat"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {otherTyping
                ? "typing…"
                : other?.is_online
                  ? "online"
                  : other
                    ? `last seen ${timeAgo(other.last_seen_at)}`
                    : ""}
            </p>
          </div>
          <button
            aria-label="Voice call"
            onClick={() => navigate(`/call/${conversationId}?type=voice`)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
          >
            <Phone className="w-4 h-4 text-foreground" />
          </button>
          <button
            aria-label="Video call"
            onClick={() => navigate(`/call/${conversationId}?type=video`)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
          >
            <Video className="w-4 h-4 text-foreground" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {visible.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center mt-6">Say hello 👋</p>
          )}
          {visible.map((m) => {
            const mine = m.sender_id === user?.id;
            const isVoice = m.content.startsWith(VOICE_PREFIX);
            const voiceUrl = isVoice ? m.content.slice(VOICE_PREFIX.length) : "";
            const isDeleted = m.deleted_for_everyone;

            const bubble = (
              <div
                className={`max-w-[75%] px-3 py-2 rounded-2xl cursor-pointer select-none ${
                  mine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary text-foreground rounded-bl-sm"
                } ${isDeleted ? "italic opacity-70" : ""}`}
              >
                {isDeleted ? (
                  <p className="text-[12px]">🚫 This message was deleted</p>
                ) : isVoice ? (
                  <VoiceBubble url={voiceUrl} mine={mine} />
                ) : (
                  <p className="text-[13px] whitespace-pre-wrap break-words">{m.content}</p>
                )}
                <div className={`flex items-center gap-1 mt-0.5 ${mine ? "justify-end" : "justify-start"}`}>
                  {m.edited_at && !isDeleted && (
                    <span className={`text-[9px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      edited
                    </span>
                  )}
                  <span className={`text-[9px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {formatTime(m.created_at)}
                  </span>
                  {mine && !isDeleted && (
                    m.read_at ? (
                      <CheckCheck className="w-3 h-3 text-primary-foreground/90" />
                    ) : (
                      <Check className="w-3 h-3 text-primary-foreground/70" />
                    )
                  )}
                </div>
              </div>
            );

            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>{bubble}</DropdownMenuTrigger>
                  <DropdownMenuContent align={mine ? "end" : "start"} className="w-44">
                    {mine && !isDeleted && !isVoice && (
                      <DropdownMenuItem onClick={() => startEdit(m)}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => deleteForMe(m)}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete for me
                    </DropdownMenuItem>
                    {mine && !isDeleted && (
                      <DropdownMenuItem
                        onClick={() => deleteForEveryone(m)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete for everyone
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          {otherTyping && (
            <div className="flex justify-start">
              <div className="bg-secondary text-foreground px-3 py-2 rounded-2xl rounded-bl-sm">
                <div className="flex gap-1 items-center h-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Editing banner */}
        {editing && (
          <div className="px-3 py-1.5 bg-secondary border-t border-border flex items-center gap-2">
            <Pencil className="w-3 h-3 text-primary" />
            <span className="text-[10px] text-muted-foreground flex-1 truncate">
              Editing: {editing.content}
            </span>
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Composer */}
        <div className="px-3 py-2 border-t border-border flex items-center gap-2">
          {recording ? (
            <>
              <button
                onClick={() => stopRecording(true)}
                aria-label="Cancel recording"
                className="w-9 h-9 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-foreground" />
              </button>
              <div className="flex-1 flex items-center gap-2 px-3 h-9 rounded-md bg-input border border-border">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                <span className="text-xs text-foreground">Recording {fmtDuration(recSec)}</span>
              </div>
              <button
                onClick={() => stopRecording(false)}
                aria-label="Send voice"
                className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center"
              >
                <Square className="w-4 h-4 text-primary-foreground" fill="currentColor" />
              </button>
            </>
          ) : (
            <>
              <Input
                value={text}
                onChange={(e) => onType(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={editing ? "Edit message" : "Type a message"}
                className="h-9 text-xs bg-input border-border"
              />
              {text.trim() || editing ? (
                <button
                  onClick={send}
                  aria-label="Send"
                  className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center disabled:opacity-50"
                  disabled={!text.trim()}
                >
                  <Send className="w-4 h-4 text-primary-foreground" />
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  aria-label="Record voice"
                  className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center"
                >
                  <Mic className="w-4 h-4 text-primary-foreground" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </MobileFrame>
  );
}
