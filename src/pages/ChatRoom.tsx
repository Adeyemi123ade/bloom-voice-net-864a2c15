import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Send, Check, CheckCheck, Mic, Square, Trash2, Pencil, X,
  Paperclip, Copy, Forward, Phone, Video, Camera, MoreVertical, Search, Info,
} from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ContactInfoSheet from "@/components/chat/ContactInfoSheet";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isReallyOnline } from "@/lib/presence";
import { clearPreparedCallMedia, formatCallMediaError, prepareCallMedia } from "@/lib/callMedia";
import { requestIgnoreBatteryOptimizations } from "@/lib/nativeCalls";
import {
  AttachmentBubble,
  FILE_PREFIX,
  encodeFileMessage,
  parseFileMessage,
  isBareAttachment,
} from "@/components/chat/AttachmentBubble";
import CallBackSheet from "@/components/call/CallBackSheet";
import { VoiceBubble } from "@/components/chat/VoiceBubble";
import { CallSystemBubble } from "@/components/chat/CallSystemBubble";
import { CallRow, SwipeRow } from "@/components/chat/MessageRows";
import {
  CALL_PREFIX,
  VOICE_PREFIX,
  fmtDuration,
  formatTime,
  initials,
  loadHidden,
  saveHidden,
} from "@/lib/chat/format";

// A row coming from Supabase (initial fetch or realtime payload) is only
// guaranteed to match the DB schema, not this shape — content in particular
// has been observed null on some rows, and every render/handler below calls
// string methods on it directly, which throws (blanking the whole app, no
// error boundary) the instant such a row reaches state. Normalize on the way in.
function normalizeMessage(raw: Record<string, unknown>): Message {
  return {
    id: String(raw.id),
    conversation_id: String(raw.conversation_id),
    sender_id: String(raw.sender_id),
    content: typeof raw.content === "string" ? raw.content : "",
    // String(undefined) is the literal text "undefined", which then fails to
    // parse as a date and renders as "Invalid Date" — fall back to "now"
    // instead of ever handing the UI an unparseable timestamp.
    created_at:
      typeof raw.created_at === "string" && !Number.isNaN(Date.parse(raw.created_at))
        ? raw.created_at
        : new Date().toISOString(),
    delivered_at: (raw.delivered_at as string | null) ?? null,
    read_at: (raw.read_at as string | null) ?? null,
    edited_at: (raw.edited_at as string | null) ?? null,
    deleted_for_everyone: Boolean(raw.deleted_for_everyone),
  };
}

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  delivered_at: string | null;
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
  show_last_seen?: boolean | null;
};

export default function ChatRoom() {
  const { id: conversationId } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Profile | null>(null);
  // Lets the realtime channel's callbacks read the latest `other` without
  // needing it in the effect's dependency array — see the channel effect
  // below for why that matters.
  const otherRef = useRef<Profile | null>(null);
  otherRef.current = other;
  const [text, setText] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Message | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const [callSheet, setCallSheet] = useState<"voice" | "video" | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recTimer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<number | null>(null);
  const [pendingFile, setPendingFile] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

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
          .select("id, display_name, avatar_url, is_online, last_seen_at, show_last_seen")
          .eq("id", otherId)
          .maybeSingle();
        if (prof) setOther(prof as Profile);
      }
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      setMessages((msgs ?? []).map(normalizeMessage));
    })();
  }, [user, conversationId]);

  useEffect(() => {
    if (!user || !conversationId) return;
    // Mark incoming messages as delivered as soon as we receive them on this device.
    const undelivered = messages.filter((m) => m.sender_id !== user.id && !m.delivered_at);
    if (undelivered.length > 0) {
      supabase
        .from("messages")
        .update({ delivered_at: new Date().toISOString() })
        .in("id", undelivered.map((m) => m.id))
        .then(() => {});
    }
    // Mark them read while the chat is open.
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
        (payload) => {
          const incoming = normalizeMessage(payload.new as Record<string, unknown>);
          setMessages((prev) => {
            // Replace matching optimistic message (same sender + content, temp id starts with "tmp-")
            const idx = prev.findIndex(
              (m) =>
                m.id.startsWith("tmp-") &&
                m.sender_id === incoming.sender_id &&
                m.content === incoming.content,
            );
            if (idx !== -1) {
              const next = prev.slice();
              next[idx] = incoming;
              return next;
            }
            // Skip if we already have it (echo race)
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const updated = normalizeMessage(payload.new as Record<string, unknown>);
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
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const row = payload.new as { id: string };
          if (!otherRef.current || row.id !== otherRef.current.id) return;
          setOther((p) => (p ? ({ ...p, ...row } as Profile) : p));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // Deliberately excludes `other?.id`: it starts null and flips to a real
    // id moments after mount once the async profile fetch resolves, which
    // used to tear down and recreate this whole channel right after the
    // initial subscribe — a rejoin race that could leave the client
    // silently unsubscribed from new messages until the page was reloaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, conversationId]);

  // Track whether the initial messages have been positioned at the bottom yet.
  // First load: instant jump to the last message (no animation).
  // Subsequent new messages: smooth scroll only if user is already near bottom.
  const didInitialScroll = useRef(false);
  const prevMsgCount = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!didInitialScroll.current && messages.length > 0) {
      // Jump instantly — do not animate through old messages.
      el.scrollTop = el.scrollHeight;
      didInitialScroll.current = true;
      prevMsgCount.current = messages.length;
      return;
    }
    if (messages.length > prevMsgCount.current) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const nearBottom = distanceFromBottom < 160;
      if (nearBottom) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
      prevMsgCount.current = messages.length;
    }
  }, [messages]);

  // Reset the initial-scroll guard when switching conversations.
  useEffect(() => {
    didInitialScroll.current = false;
    prevMsgCount.current = 0;
  }, [conversationId]);

  const startCall = async (type: "voice" | "video") => {
    if (!user || !conversationId || !other) return;
    // First-call hint: ask Android to exempt us from battery optimizations so
    // FCM pushes wake the device reliably. No-op on web/iOS.
    if (!localStorage.getItem("chichat:battery-prompt-shown")) {
      void requestIgnoreBatteryOptimizations();
      localStorage.setItem("chichat:battery-prompt-shown", "1");
    }
    try {
      await prepareCallMedia(type === "video");
    } catch (error) {
      toast({
        title: "Call permission needed",
        description: formatCallMediaError(error, type === "video"),
        variant: "destructive",
      });
      return;
    }

    const roomName = `chichat-${conversationId}-${Date.now()}`;

    // Pre-create room with short timeouts so it auto-closes if no one joins / both leave.
    const { error: roomErr } = await supabase.functions.invoke("twilio-room", {
      body: { action: "create", roomName },
    });
    if (roomErr) {
      clearPreparedCallMedia();
      toast({ title: "Could not start call", description: roomErr.message, variant: "destructive" });
      return;
    }

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
      clearPreparedCallMedia();
      toast({ title: "Could not start call", description: error.message, variant: "destructive" });
      return;
    }
    // Fire-and-forget high-priority FCM push so the callee's Android device
    // wakes up and rings even if the app is backgrounded or screen is off.
    void supabase.functions.invoke("send-call-push", {
      body: {
        calleeId: other.id,
        callId: data.id,
        callType: type,
        callerName: other.display_name ?? "Someone",
        conversationId,
        roomName,
      },
    }).catch((e) => console.warn("[call-push] failed", e));
    navigate(`/call/${conversationId}?type=${type}&callId=${data.id}&room=${encodeURIComponent(roomName)}&role=caller`, { replace: true });
  };

  const send = async () => {
    if (!user || !conversationId) return;
    const content = text.trim();
    if (!content) return;
    setText("");

    if (editing) {
      const editId = editing.id;
      const editedAt = new Date().toISOString();
      // Optimistic edit
      setMessages((prev) =>
        prev.map((m) => (m.id === editId ? { ...m, content, edited_at: editedAt } : m)),
      );
      setEditing(null);
      const { error } = await supabase
        .from("messages")
        .update({ content, edited_at: editedAt })
        .eq("id", editId);
      if (error) toast({ title: "Edit failed", description: error.message, variant: "destructive" });
      return;
    }

    let finalContent = content;
    if (replyTo) {
      const preview = replyTo.content.startsWith(VOICE_PREFIX)
        ? "🎤 Voice note"
        : replyTo.content.length > 80 ? replyTo.content.slice(0, 80) + "…" : replyTo.content;
      finalContent = `> ${preview}\n${content}`;
      setReplyTo(null);
    }

    // Optimistic: add the message immediately so it appears with no perceived lag.
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Message = {
      id: tmpId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: finalContent,
      created_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      edited_at: null,
      deleted_for_everyone: false,
    };
    setMessages((prev) => [...prev, optimistic]);

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: finalContent,
    });
    if (error) {
      // Roll back optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
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
  const selectedList = useMemo(
    () => messages.filter((m) => selectedIds.has(m.id)),
    [selectedIds, messages],
  );
  const selectionCount = selectedList.length;
  const onlySelected = selectionCount === 1 ? selectedList[0] : null;
  const clearSelection = () => setSelectedIds(new Set());
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (m: Message) => {
    setEditing(m);
    setText(m.content);
    clearSelection();
  };
  const cancelEdit = () => {
    setEditing(null);
    setText("");
  };
  const deleteForMe = (msgs: Message[]) => {
    if (!conversationId) return;
    const next = new Set(hidden);
    msgs.forEach((m) => next.add(m.id));
    setHidden(next);
    saveHidden(conversationId, next);
    clearSelection();
  };
  const deleteForEveryone = async (msgs: Message[]) => {
    const ids = msgs.map((m) => m.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("messages")
      .update({ deleted_for_everyone: true, content: "" })
      .in("id", ids);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    clearSelection();
  };
  const bulkDelete = async () => {
    if (!user) return;
    const mine = selectedList.filter((m) => m.sender_id === user.id && !m.deleted_for_everyone);
    const others = selectedList.filter((m) => m.sender_id !== user.id || m.deleted_for_everyone);
    if (mine.length) await deleteForEveryone(mine);
    if (others.length) deleteForMe(others);
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
  const shareMsgs = async (msgs: Message[]) => {
    const txt = msgs
      .map((m) =>
        m.content.startsWith(VOICE_PREFIX) ? m.content.slice(VOICE_PREFIX.length) : m.content,
      )
      .join("\n\n");
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
    setReplyTo(m);
    clearSelection();
  };
  const cancelReply = () => setReplyTo(null);

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

  // Attachment upload — stage the file and show caption preview, send on confirm.
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const MAX = 25 * 1024 * 1024; // 25MB
    if (f.size > MAX) {
      toast({ title: "File too large", description: "Max 25MB", variant: "destructive" });
      return;
    }
    setPendingFile({ file: f, previewUrl: URL.createObjectURL(f) });
  };

  const cancelPending = () => {
    if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
    setText("");
  };

  const sendPending = async () => {
    if (!pendingFile || !user || !conversationId) return;
    const f = pendingFile.file;
    const caption = text.trim();
    setUploading(true);
    try {
      const safeName = f.name.replace(/[^\w.\-]+/g, "_");
      const path = `${user.id}/${conversationId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("chat-media")
        .upload(path, f, { contentType: f.type || "application/octet-stream" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
      const content = encodeFileMessage({
        url: pub.publicUrl,
        mime: f.type || "application/octet-stream",
        name: f.name,
        size: f.size,
        caption,
      });
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
      });
      if (error) throw error;
      URL.revokeObjectURL(pendingFile.previewUrl);
      setPendingFile(null);
      setText("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const visible = useMemo(() => messages.filter((m) => !hidden.has(m.id)), [messages, hidden]);
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter(
      (m) => !m.deleted_for_everyone && m.content.toLowerCase().includes(q),
    );
  }, [visible, searchQuery]);
  const clearChat = () => {
    setClearChatOpen(false);
    deleteForMe(messages);
  };

  const allMine = onlySelected
    ? onlySelected.sender_id === user?.id
    : selectedList.length > 0 && selectedList.every((m) => m.sender_id === user?.id);
  const isOnlyVoice = onlySelected?.content.startsWith(VOICE_PREFIX);
  const isOnlyCall = onlySelected?.content.startsWith(CALL_PREFIX);
  const isOnlyFile = onlySelected?.content.startsWith(FILE_PREFIX);
  const isOnlyDeleted = onlySelected?.deleted_for_everyone;
  const isUneditable = isOnlyVoice || isOnlyCall || isOnlyFile;
  const anyCall = selectedList.some((m) => m.content.startsWith(CALL_PREFIX));

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background" onClick={clearSelection}>
        {/* Header OR Search bar OR Selection action bar */}
        {searchOpen ? (
          <div
            className="px-2 pt-4 pb-3 flex items-center gap-1 border-b border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Close search"
              onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary shrink-0"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <Input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in this chat"
              className="h-9 text-xs bg-input border-border flex-1"
            />
          </div>
        ) : selectionCount > 0 ? (
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
            <span className="text-xs font-semibold text-foreground ml-1">
              {selectionCount}
            </span>
            <div className="flex-1" />
            {selectionCount === 1 && !isOnlyDeleted && !isOnlyCall && (
              <button
                aria-label="Copy"
                onClick={() => onlySelected && copyMsg(onlySelected)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Copy className="w-4 h-4 text-foreground" />
              </button>
            )}
            {!anyCall && (
              <button
                aria-label="Forward"
                onClick={() => shareMsgs(selectedList.filter((m) => !m.deleted_for_everyone))}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Forward className="w-4 h-4 text-foreground" />
              </button>
            )}
            {selectionCount === 1 && allMine && !isOnlyDeleted && !isUneditable && (
              <button
                aria-label="Edit"
                onClick={() => onlySelected && startEdit(onlySelected)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Pencil className="w-4 h-4 text-foreground" />
              </button>
            )}
            <button
              aria-label="Delete selected"
              onClick={() => setDeleteOpen(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </button>
          </div>
        ) : (
          <div className="px-3 pt-4 pb-3 flex items-center gap-2 border-b border-border">
            <button
              aria-label="Back"
              onClick={(e) => { e.stopPropagation(); navigate(-1); }}
              className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center hover:bg-secondary shrink-0"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <div className="relative">
              <Avatar className="w-9 h-9">
                <AvatarImage src={other?.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">
                  {initials(other?.display_name)}
                </AvatarFallback>
              </Avatar>
              {other && (() => {
                const ageMs = Date.now() - new Date(other.last_seen_at).getTime();
                return other.is_online && ageMs < 5 * 60 * 1000;
              })() && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent border-2 border-background" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate leading-tight">
                {other?.display_name ?? "Chat"}
              </p>
              {/* Fixed-height status row — never changes header height */}
              <div className="h-[14px] flex items-center">
                {otherTyping ? (
                  <span className="text-xs text-primary truncate flex items-center gap-1">
                    <span className="flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1 h-1 rounded-full bg-primary animate-bounce" />
                    </span>
                    typing
                  </span>
                ) : isReallyOnline(other) ? (
                  <span className="text-xs text-muted-foreground truncate">online</span>
                ) : null}
              </div>
            </div>
            <button
              aria-label="Voice call"
              onClick={(e) => { e.stopPropagation(); startCall("voice"); }}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
            >
              <Phone className="w-5 h-5 text-foreground" />
            </button>
            <button
              aria-label="Video call"
              onClick={(e) => { e.stopPropagation(); startCall("video"); }}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
            >
              <Video className="w-5 h-5 text-foreground" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="More options"
                  onClick={(e) => e.stopPropagation()}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
                >
                  <MoreVertical className="w-5 h-5 text-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => setContactInfoOpen(true)}>
                  <Info className="w-4 h-4 mr-2" /> View contact
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSearchOpen(true)}>
                  <Search className="w-4 h-4 mr-2" /> Search
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setClearChatOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Clear chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {searchOpen && searchQuery.trim() && searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-6">No matches</p>
          )}
          {!searchOpen && visible.length === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-6">Say hello 👋</p>
          )}
          {(searchOpen && searchQuery.trim() ? searchResults : visible).map((m) => {
            const mine = m.sender_id === user?.id;
            const isVoice = m.content.startsWith(VOICE_PREFIX);
            const isCall = m.content.startsWith(CALL_PREFIX);
            const isFile = m.content.startsWith(FILE_PREFIX);
            const voiceUrl = isVoice ? m.content.slice(VOICE_PREFIX.length) : "";
            const fileMeta = isFile ? parseFileMessage(m.content) : null;
            const isDeleted = m.deleted_for_everyone;
            const isSelected = selectedIds.has(m.id);

            if (isCall) {
              return (
                <CallRow
                  key={m.id}
                  mine={mine}
                  isSelected={isSelected}
                  onTap={() => {
                    if (selectionCount > 0) toggleSelect(m.id);
                  }}
                  onLongPress={() => toggleSelect(m.id)}
                >
                  <CallSystemBubble
                    m={m}
                    mine={mine}
                    otherName={other?.display_name}
                    onCallBack={(t) => setCallSheet(t)}
                  />
                </CallRow>
              );
            }

            // Parse quoted reply prefix: lines starting with "> " followed by message
            let quoted: string | null = null;
            let body = m.content;
            if (!isVoice && !isFile && !isDeleted && body.startsWith("> ")) {
              const nl = body.indexOf("\n");
              if (nl > -1) {
                quoted = body.slice(2, nl);
                body = body.slice(nl + 1);
              }
            }

            const bareAttachment = isFile && fileMeta && isBareAttachment(fileMeta);

            return (
              <SwipeRow
                key={m.id}
                mine={mine}
                onReply={() => replyMsg(m)}
                onTap={(e) => {
                  e.stopPropagation();
                  // In selection mode, tap toggles. Otherwise tap does nothing
                  // (selection requires long-press to avoid accidental opens).
                  if (selectionCount > 0) toggleSelect(m.id);
                }}
                onLongPress={() => toggleSelect(m.id)}
              >
                <div
                  className={`max-w-[92%] select-none transition-shadow ${
                    bareAttachment
                      ? `rounded-2xl ${isSelected ? "ring-2 ring-accent" : ""}`
                      : `px-4 py-2.5 rounded-2xl shadow-sm ${
                          mine
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-card text-foreground rounded-bl-sm"
                        } ${isDeleted ? "italic opacity-70" : ""} ${
                          isSelected ? "ring-2 ring-accent" : ""
                        }`
                  }`}
                >
                  {quoted && !bareAttachment && (
                    <div
                      className={`mb-1 px-2 py-1 rounded-md border-l-2 text-xs truncate ${
                        mine
                          ? "bg-primary-foreground/10 border-primary-foreground/60 text-primary-foreground/85"
                          : "bg-foreground/5 border-primary text-muted-foreground"
                      }`}
                    >
                      {quoted}
                    </div>
                  )}
                  {isDeleted ? (
                    <p className="text-[12px]">🚫 This message was deleted</p>
                  ) : isVoice ? (
                    <VoiceBubble id={m.id} url={voiceUrl} mine={mine} />
                  ) : isFile && fileMeta ? (
                    <AttachmentBubble
                      meta={fileMeta}
                      mine={mine}
                      timestamp={m.created_at}
                      onDelete={() => {
                        setSelectedIds(new Set([m.id]));
                        setDeleteOpen(true);
                      }}
                    />
                  ) : (
                    <p className="text-[13px] whitespace-pre-wrap break-words">{body}</p>
                  )}
                  {!bareAttachment && (
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
                          <CheckCheck className="w-3 h-3 text-sky-400" />
                        ) : m.delivered_at ? (
                          <CheckCheck className={`w-3 h-3 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`} />
                        ) : (
                          <Check className={`w-3 h-3 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`} />
                        )
                      )}
                    </div>
                  )}
                </div>
              </SwipeRow>
            );
          })}
          {otherTyping && (
            <div className="flex justify-start">
              <div className="bg-card text-foreground px-3 py-2 rounded-2xl rounded-bl-sm shadow-sm">
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
            <span className="text-2xs text-muted-foreground flex-1 truncate">
              Editing: {editing.content}
            </span>
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Reply preview banner (WhatsApp-style) */}
        {replyTo && !editing && (
          <div
            className="px-3 py-2 bg-secondary border-t border-border flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-1 self-stretch rounded bg-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-2xs font-semibold text-primary">
                Replying to {replyTo.sender_id === user?.id ? "yourself" : other?.display_name ?? "them"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {replyTo.content.startsWith(VOICE_PREFIX)
                  ? "🎤 Voice note"
                  : replyTo.content.startsWith(FILE_PREFIX)
                    ? `📎 ${parseFileMessage(replyTo.content)?.name ?? "Attachment"}`
                    : replyTo.content}
              </p>
            </div>
            <button onClick={cancelReply} aria-label="Cancel reply" className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Pending attachment preview (shown above composer) */}
        {pendingFile && (
          <div
            className="px-3 py-2 bg-secondary/60 border-t border-border flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-background flex items-center justify-center flex-shrink-0">
              {pendingFile.file.type.startsWith("image/") ? (
                <img
                  src={pendingFile.previewUrl}
                  alt={pendingFile.file.name}
                  className="w-full h-full object-cover"
                />
              ) : pendingFile.file.type.startsWith("video/") ? (
                <video src={pendingFile.previewUrl} className="w-full h-full object-cover" />
              ) : (
                <Paperclip className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-foreground truncate">
                {pendingFile.file.name}
              </p>
              <p className="text-2xs text-muted-foreground">
                {(pendingFile.file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={cancelPending}
              aria-label="Remove attachment"
              className="w-7 h-7 rounded-full hover:bg-background flex items-center justify-center text-muted-foreground"
              disabled={uploading}
            >
              <X className="w-4 h-4" />
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
                accept="*/*"
                className="hidden"
                onChange={onPickFile}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onPickFile}
              />
              {!pendingFile && (
                <button
                  onClick={() => fileRef.current?.click()}
                  aria-label="Attach file"
                  className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center"
                >
                  <Paperclip className="w-4 h-4 text-foreground" />
                </button>
              )}
              <Input
                value={text}
                onChange={(e) => (pendingFile ? setText(e.target.value) : onType(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (pendingFile) sendPending();
                    else send();
                  }
                }}
                placeholder={
                  pendingFile
                    ? "Add a caption (optional)…"
                    : editing
                      ? "Edit message"
                      : "Type a message"
                }
                disabled={uploading}
                className="h-9 text-xs bg-input border-border"
              />
              {!pendingFile && (
                <button
                  onClick={() => cameraRef.current?.click()}
                  aria-label="Take photo"
                  className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center"
                >
                  <Camera className="w-4 h-4 text-foreground" />
                </button>
              )}
              {pendingFile ? (
                <button
                  onClick={sendPending}
                  aria-label="Send attachment"
                  disabled={uploading}
                  className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center disabled:opacity-50"
                >
                  <Send className="w-4 h-4 text-primary-foreground" />
                </button>
              ) : text.trim() || editing ? (
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
      {deleteOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/30"
            onClick={() => setDeleteOpen(false)}
          />
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[61] w-[260px] rounded-xl bg-background border border-border shadow-lg overflow-hidden">
            {allMine && !isOnlyDeleted && (
              <button
                onClick={async () => {
                  setDeleteOpen(false);
                  await deleteForEveryone(selectedList);
                }}
                className="w-full h-11 text-sm text-foreground hover:bg-secondary border-b border-border"
              >
                Delete for everyone
              </button>
            )}
            <button
              onClick={() => {
                setDeleteOpen(false);
                deleteForMe(selectedList);
              }}
              className="w-full h-11 text-sm text-foreground hover:bg-secondary border-b border-border"
            >
              Delete for me
            </button>
            <button
              onClick={() => setDeleteOpen(false)}
              className="w-full h-11 text-sm text-foreground hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </>
      )}
      <CallBackSheet
        open={!!callSheet}
        onOpenChange={(o) => !o && setCallSheet(null)}
        name={other?.display_name ?? "Contact"}
        type={callSheet ?? "voice"}
        onConfirm={() => callSheet && startCall(callSheet)}
      />
      {clearChatOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/30"
            onClick={() => setClearChatOpen(false)}
          />
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[61] w-[280px] rounded-xl bg-background border border-border shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Clear this chat?</p>
              <p className="text-xs text-muted-foreground mt-1">
                All messages will be removed from your view. This only affects you — {other?.display_name ?? "the other person"} will still see them.
              </p>
            </div>
            <button
              onClick={clearChat}
              className="w-full h-11 text-sm text-destructive hover:bg-secondary border-b border-border"
            >
              Clear chat
            </button>
            <button
              onClick={() => setClearChatOpen(false)}
              className="w-full h-11 text-sm text-foreground hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </>
      )}
      <ContactInfoSheet
        open={contactInfoOpen}
        onOpenChange={setContactInfoOpen}
        contact={other}
      />
    </MobileFrame>
  );
}
