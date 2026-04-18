import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Send, Check, CheckCheck, Phone, Video, Mic, Square, Trash2, Pencil, X,
  Play, Pause, Paperclip, Copy, Reply, Forward, PhoneIncoming, PhoneOutgoing, PhoneMissed,
} from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
const VOICE_PREFIX = "[voice]";
const CALL_PREFIX = "[call]"; // [call]video|ended|45  or [call]voice|missed|0

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

// --- Single-instance audio manager (prevents overlap & playback bugs) ---
type AudioCtl = {
  current: HTMLAudioElement | null;
  id: string | null;
  listeners: Set<() => void>;
};
const audioCtl: AudioCtl = { current: null, id: null, listeners: new Set() };
const notify = () => audioCtl.listeners.forEach((fn) => fn());

function useAudioPlayer(id: string, url: string) {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    audioCtl.listeners.add(fn);
    return () => {
      audioCtl.listeners.delete(fn);
    };
  }, []);
  const playing = audioCtl.id === id && !audioCtl.current?.paused;
  const [dur, setDur] = useState(0);
  const [pos, setPos] = useState(0);
  const probeRef = useRef<HTMLAudioElement | null>(null);

  // probe duration
  useEffect(() => {
    const a = new Audio();
    a.preload = "metadata";
    a.src = url;
    probeRef.current = a;
    const onMeta = () => {
      const d = isFinite(a.duration) ? a.duration : 0;
      setDur(Math.floor(d));
    };
    a.addEventListener("loadedmetadata", onMeta);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      probeRef.current = null;
    };
  }, [url]);

  // sync time updates while this id is playing
  useEffect(() => {
    if (audioCtl.id !== id || !audioCtl.current) return;
    const a = audioCtl.current;
    const upd = () => setPos(Math.floor(a.currentTime));
    a.addEventListener("timeupdate", upd);
    return () => a.removeEventListener("timeupdate", upd);
  }, [id, playing]);

  const toggle = useCallback(() => {
    if (audioCtl.id === id && audioCtl.current) {
      if (audioCtl.current.paused) {
        audioCtl.current.play().catch((e) =>
          toast({ title: "Playback failed", description: e.message, variant: "destructive" }),
        );
      } else {
        audioCtl.current.pause();
      }
      notify();
      return;
    }
    // new track
    if (audioCtl.current) {
      audioCtl.current.pause();
      audioCtl.current.src = "";
    }
    const a = new Audio(url);
    audioCtl.current = a;
    audioCtl.id = id;
    a.onended = () => {
      audioCtl.current = null;
      audioCtl.id = null;
      setPos(0);
      notify();
    };
    a.onerror = () => {
      toast({ title: "Audio error", description: "Could not load voice note", variant: "destructive" });
      audioCtl.current = null;
      audioCtl.id = null;
      notify();
    };
    a.play()
      .then(() => notify())
      .catch((e) => {
        toast({ title: "Playback failed", description: e.message, variant: "destructive" });
        audioCtl.current = null;
        audioCtl.id = null;
        notify();
      });
  }, [id, url]);

  return { playing, dur, pos, toggle };
}

function VoiceBubble({ id, url, mine }: { id: string; url: string; mine: boolean }) {
  const { playing, dur, pos, toggle } = useAudioPlayer(id, url);
  const pct = dur ? (pos / dur) * 100 : 0;
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <button
        onClick={(e) => { e.stopPropagation(); toggle(); }}
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

function CallSystemBubble({ m, mine }: { m: Message; mine: boolean }) {
  // [call]video|ended|45
  const [, body] = m.content.split(CALL_PREFIX);
  const [type, status, durStr] = (body ?? "").split("|");
  const isVideo = type === "video";
  const dur = parseInt(durStr || "0", 10);
  const missed = status === "missed" || status === "declined";
  const Icon = missed ? PhoneMissed : mine ? PhoneOutgoing : PhoneIncoming;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-secondary text-foreground">
      <Icon className={`w-4 h-4 ${missed ? "text-destructive" : "text-primary"}`} />
      <div className="flex flex-col">
        <span className="text-[12px] font-medium">
          {isVideo ? "Video call" : "Voice call"} {missed ? "· missed" : status === "ended" ? "· ended" : ""}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {dur > 0 ? fmtDuration(dur) : formatTime(m.created_at)}
        </span>
      </div>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recTimer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const startCall = async (type: "voice" | "video") => {
    if (!user || !conversationId || !other) return;
    const roomName = `chichat-${conversationId}-${Date.now()}`;
    const { data, error } = await supabase
      .from("calls")
      .insert({
        conversation_id: conversationId,
        caller_id: user.id,
        callee_id: other.id,
        room_name: roomName,
        call_type: type,
      })
      .select("id")
      .single();
    if (error) {
      toast({ title: "Could not start call", description: error.message, variant: "destructive" });
      return;
    }
    navigate(`/call/${conversationId}?type=${type}&callId=${data.id}&room=${encodeURIComponent(roomName)}&role=caller`);
  };

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

  // Selection / actions
  const selected = useMemo(
    () => (selectedId ? messages.find((m) => m.id === selectedId) ?? null : null),
    [selectedId, messages],
  );
  const clearSelection = () => setSelectedId(null);

  const startEdit = (m: Message) => {
    setEditing(m);
    setText(m.content);
    clearSelection();
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
    clearSelection();
  };
  const deleteForEveryone = async (m: Message) => {
    const { error } = await supabase
      .from("messages")
      .update({ deleted_for_everyone: true, content: "" })
      .eq("id", m.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    clearSelection();
  };
  const copyMsg = async (m: Message) => {
    const txt = m.content.startsWith(VOICE_PREFIX) ? m.content.slice(VOICE_PREFIX.length) : m.content;
    try {
      await navigator.clipboard.writeText(txt);
      toast({ title: "Copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
    clearSelection();
  };
  const shareMsg = async (m: Message) => {
    const txt = m.content.startsWith(VOICE_PREFIX) ? m.content.slice(VOICE_PREFIX.length) : m.content;
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ text: txt });
      } else {
        await navigator.clipboard.writeText(txt);
        toast({ title: "Copied to clipboard (share unavailable)" });
      }
    } catch {}
    clearSelection();
  };
  const replyMsg = (m: Message) => {
    const preview = m.content.length > 60 ? m.content.slice(0, 60) + "…" : m.content;
    setText(`> ${preview}\n`);
    clearSelection();
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

  // Attachment upload (image/file -> sent as voice-style url, but we just send link for now)
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !user || !conversationId) return;
    const path = `${user.id}/${conversationId}/${Date.now()}-${f.name}`;
    const { error: upErr } = await supabase.storage
      .from("chat-media")
      .upload(path, f, { contentType: f.type });
    if (upErr) {
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: pub.publicUrl,
    });
  };

  const visible = useMemo(() => messages.filter((m) => !hidden.has(m.id)), [messages, hidden]);

  const isSelectionMine = selected?.sender_id === user?.id;
  const isSelectionVoice = selected?.content.startsWith(VOICE_PREFIX);
  const isSelectionCall = selected?.content.startsWith(CALL_PREFIX);
  const isSelectionDeleted = selected?.deleted_for_everyone;

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background" onClick={clearSelection}>
        {/* Header OR Selection action bar */}
        {selected ? (
          <div
            className="px-2 pt-4 pb-3 flex items-center gap-1 border-b border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Cancel"
              onClick={clearSelection}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
            <span className="text-xs text-muted-foreground flex-1 px-1">1 selected</span>
            {!isSelectionDeleted && !isSelectionCall && (
              <button
                aria-label="Copy"
                onClick={() => selected && copyMsg(selected)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Copy className="w-4 h-4 text-foreground" />
              </button>
            )}
            {!isSelectionDeleted && !isSelectionCall && (
              <button
                aria-label="Reply"
                onClick={() => selected && replyMsg(selected)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Reply className="w-4 h-4 text-foreground" />
              </button>
            )}
            {!isSelectionDeleted && !isSelectionCall && (
              <button
                aria-label="Share / Forward"
                onClick={() => selected && shareMsg(selected)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Forward className="w-4 h-4 text-foreground" />
              </button>
            )}
            {isSelectionMine && !isSelectionDeleted && !isSelectionVoice && !isSelectionCall && (
              <button
                aria-label="Edit"
                onClick={() => selected && startEdit(selected)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Pencil className="w-4 h-4 text-foreground" />
              </button>
            )}
            <button
              aria-label="Delete for me"
              onClick={() => selected && deleteForMe(selected)}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
            >
              <Trash2 className="w-4 h-4 text-foreground" />
            </button>
            {isSelectionMine && !isSelectionDeleted && (
              <button
                aria-label="Delete for everyone"
                onClick={() => selected && deleteForEveryone(selected)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </button>
            )}
          </div>
        ) : (
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
              onClick={() => startCall("voice")}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
            >
              <Phone className="w-4 h-4 text-foreground" />
            </button>
            <button
              aria-label="Video call"
              onClick={() => startCall("video")}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
            >
              <Video className="w-4 h-4 text-foreground" />
            </button>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {visible.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center mt-6">Say hello 👋</p>
          )}
          {visible.map((m) => {
            const mine = m.sender_id === user?.id;
            const isVoice = m.content.startsWith(VOICE_PREFIX);
            const isCall = m.content.startsWith(CALL_PREFIX);
            const voiceUrl = isVoice ? m.content.slice(VOICE_PREFIX.length) : "";
            const isDeleted = m.deleted_for_everyone;
            const isSelected = selectedId === m.id;

            if (isCall) {
              return (
                <div
                  key={m.id}
                  className={`flex justify-center`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(isSelected ? null : m.id);
                  }}
                >
                  <div className={isSelected ? "ring-2 ring-primary rounded-2xl" : ""}>
                    <CallSystemBubble m={m} mine={mine} />
                  </div>
                </div>
              );
            }

            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(isSelected ? null : m.id);
                }}
              >
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl select-none transition-shadow ${
                    mine
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-foreground rounded-bl-sm"
                  } ${isDeleted ? "italic opacity-70" : ""} ${
                    isSelected ? "ring-2 ring-accent" : ""
                  }`}
                >
                  {isDeleted ? (
                    <p className="text-[12px]">🚫 This message was deleted</p>
                  ) : isVoice ? (
                    <VoiceBubble id={m.id} url={voiceUrl} mine={mine} />
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
          <div
            className="px-3 py-1.5 bg-secondary border-t border-border flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil className="w-3 h-3 text-primary" />
            <span className="text-[10px] text-muted-foreground flex-1 truncate">
              Editing: {editing.content}
            </span>
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Composer — lifted above bottom edge */}
        <div
          className="px-3 pt-2 pb-4 border-t border-border flex items-center gap-2 bg-background"
          onClick={(e) => e.stopPropagation()}
        >
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
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,audio/*,application/pdf"
                className="hidden"
                onChange={onPickFile}
              />
              <button
                onClick={() => fileRef.current?.click()}
                aria-label="Attach file"
                className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center"
              >
                <Paperclip className="w-4 h-4 text-foreground" />
              </button>
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
