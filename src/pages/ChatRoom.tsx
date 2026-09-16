import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Send, Check, CheckCheck, Mic, Trash2, Pencil, X,
  Paperclip, Copy, Share2, Phone, Video, Smile, MoreVertical, Search, Info,
  Type, Loader2,
} from "lucide-react";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";
import type { EmojiClickData } from "emoji-picker-react";
import { useTheme } from "next-themes";
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
import { getSignedChatMediaUrl } from "@/lib/signedMedia";
import { pickRecordingMimeType, extensionForMimeType, baseMimeType } from "@/lib/audioMime";
import { checkMicPrerequisites, describeMicError } from "@/lib/micPermission";
import { isVoiceTranscribeEnabled } from "@/lib/transcriptionPrefs";
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
import { VoiceRecorderBar } from "@/components/chat/VoiceRecorderBar";
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
// A message row's `content` is never legitimately empty — every send path
// (text/voice/attachment) always writes a non-empty, prefixed string before
// insert. If a realtime payload — or an immediate re-fetch of the same row —
// ever comes back with blank content, that's a transient read-after-write
// race (the client observes the row before a lagging connection/replica has
// caught up with the write it was just notified about), not a real state.
// A single-shot re-fetch can still lose that race; retry with backoff so a
// message doesn't get stuck rendering as an empty "timestamp only" bubble
// with delete/copy/forward silently no-op'ing on it until a full reload.
async function fetchMessageRowWithRetry(
  id: string,
  attempts = 5,
): Promise<Record<string, unknown> | null> {
  for (let i = 0; i < attempts; i++) {
    const { data } = await supabase.from("messages").select("*").eq("id", id).maybeSingle();
    const content = (data as Record<string, unknown> | null)?.content;
    if (data && typeof content === "string" && content) {
      return data as Record<string, unknown>;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  return null;
}

// The realtime INSERT/UPDATE handlers below retry a blank-content row via
// fetchMessageRowWithRetry — but a plain bulk `select("*")` (the initial
// conversation load, and resync() after a reconnect) reads the exact same
// replication-lag-affected rows with no such protection, so a message that
// hasn't finished replicating yet gets normalized straight into a
// blank-content bubble with no retry at all. Apply the same per-row retry
// here so every path that can observe a freshly-inserted row is protected,
// not just the realtime echo. A message's content is never legitimately
// empty (see normalizeMessage above), so this only ever fires for the rare
// lagging row, not on every load.
async function reconcileBlankRows(rows: Record<string, unknown>[]): Promise<Message[]> {
  const fixed = await Promise.all(
    rows.map(async (row) => {
      if (typeof row.content === "string" && row.content && !row.deleted_for_everyone) {
        return normalizeMessage(row);
      }
      if (row.deleted_for_everyone) return normalizeMessage(row);
      console.warn("[realtime] bulk-fetched row arrived with blank content, retrying", row.id);
      const retried = await fetchMessageRowWithRetry(String(row.id));
      if (retried) return normalizeMessage(retried);
      console.error("[realtime] bulk-fetched row still blank after retries", row.id);
      return normalizeMessage(row);
    }),
  );
  return fixed;
}

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
  const { resolvedTheme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Profile | null>(null);
  // Lets the realtime channel's callbacks read the latest `other` without
  // needing it in the effect's dependency array — see the channel effect
  // below for why that matters.
  const otherRef = useRef<Profile | null>(null);
  otherRef.current = other;
  // Holds the current conversation's resync function so the visibility/
  // network-regain effect below (which intentionally has no conversationId/
  // user deps, so it doesn't get torn down and recreated per conversation)
  // can always call the latest one. See the channel effect for what it does.
  const resyncRef = useRef<() => void>(() => {});
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
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const highlightTimer = useRef<number | null>(null);
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const [callSheet, setCallSheet] = useState<"voice" | "video" | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recTimer = useRef<number | null>(null);
  const recMimeTypeRef = useRef<string>("audio/webm");
  const fileRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
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
      setMessages(await reconcileBlankRows(msgs ?? []));
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

    // Refetches the authoritative message list for this conversation and
    // reconciles it into local state. Realtime is still the primary delivery
    // path — this only backstops it for whatever it missed while the app was
    // backgrounded or the socket was dropped (realtime has no such fallback
    // for messages today, unlike the calling flow's polling safety net).
    // In-flight optimistic sends (tmp- ids not yet echoed back by the
    // server) are preserved as-is; everything else defers to server state.
    const resync = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (!data) return;
      const fresh = await reconcileBlankRows(data);
      const freshIds = new Set(fresh.map((m) => m.id));
      setMessages((prev) => {
        const pending = prev.filter((m) => m.id.startsWith("tmp-") && !freshIds.has(m.id));
        return [...fresh, ...pending];
      });
    };
    resyncRef.current = resync;

    let hasSubscribedBefore = false;
    const ch = supabase
      .channel(`room-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const raw = payload.new as Record<string, unknown>;
          // An event can carry no usable record at all (payload.errors set,
          // `new` empty). There is no id to look the row up by, so fall back
          // to the authoritative list for this conversation rather than
          // appending an empty bubble — still driven by this realtime event,
          // not by a timer.
          if (!raw?.id) {
            console.error("[realtime] INSERT payload unusable, resyncing", payload.errors);
            await resync();
            return;
          }
          let incoming = normalizeMessage(raw);
          // A realtime INSERT payload should always carry the real content —
          // but if one ever arrives blank (a dropped/partial event), trust
          // nothing and re-fetch that exact row by id, retrying with backoff
          // (see fetchMessageRowWithRetry) rather than rendering a message
          // with no content until the user manually refreshes.
          if (!incoming.content) {
            console.warn("[realtime] INSERT payload arrived with blank content, retrying fetch", incoming.id);
            const data = await fetchMessageRowWithRetry(incoming.id);
            if (data) {
              incoming = normalizeMessage(data);
            } else {
              console.error("[realtime] INSERT re-fetch still blank after retries", incoming.id);
            }
          }
          setMessages((prev) => {
            // Own sends (text/voice/attachment) now adopt their real row id
            // synchronously right after insert() resolves — see send() /
            // uploadVoice() / sendPending() — so by the time this echo
            // arrives, `prev.some(m => m.id === incoming.id)` below almost
            // always already matches and this content-based match is only a
            // fallback for the rare case this event wins that race.
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
        async (payload) => {
          let updated = normalizeMessage(payload.new as Record<string, unknown>);
          if (!updated.content) {
            console.warn("[realtime] UPDATE payload arrived with blank content, retrying fetch", updated.id);
            const data = await fetchMessageRowWithRetry(updated.id);
            if (data) updated = normalizeMessage(data);
            else {
              console.error("[realtime] UPDATE re-fetch still blank after retries", updated.id);
              return;
            }
          }
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
      .subscribe((status) => {
        // "SUBSCRIBED" fires on the initial join AND on every automatic
        // rejoin after a dropped/reconnected realtime connection. The
        // initial join's data is already covered by the message-load effect
        // above, so only resync on a genuine rejoin, when something could
        // have been missed while the socket was down.
        if (status === "SUBSCRIBED") {
          if (hasSubscribedBefore) void resync();
          hasSubscribedBefore = true;
        }
      });
    return () => {
      resyncRef.current = () => {};
      supabase.removeChannel(ch);
    };
    // Deliberately excludes `other?.id`: it starts null and flips to a real
    // id moments after mount once the async profile fetch resolves, which
    // used to tear down and recreate this whole channel right after the
    // initial subscribe — a rejoin race that could leave the client
    // silently unsubscribed from new messages until the page was reloaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, conversationId]);

  // Backstop for the case realtime's own reconnect logic doesn't fire (or is
  // slow to) after the app was backgrounded/offline: resync as soon as the
  // tab/app becomes visible again or the network comes back.
  useEffect(() => {
    const onResync = () => {
      if (document.visibilityState === "visible") resyncRef.current();
    };
    document.addEventListener("visibilitychange", onResync);
    window.addEventListener("focus", onResync);
    window.addEventListener("online", onResync);
    return () => {
      document.removeEventListener("visibilitychange", onResync);
      window.removeEventListener("focus", onResync);
      window.removeEventListener("online", onResync);
    };
  }, []);

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

  // Swap an optimistic tmp- id for the real row id once insert() resolves.
  // Also carries over selection state — a message can in principle be
  // long-pressed while its upload/insert round trip is still in flight, and
  // without this the selection would silently point at an id that no longer
  // matches anything in `messages`, making the just-selected message look
  // like it dropped out of the selection for no reason.
  const adoptRealId = (tmpId: string, realId: string) => {
    setMessages((prev) => {
      const tmpIdx = prev.findIndex((m) => m.id === tmpId);
      if (tmpIdx === -1) return prev; // already reconciled by the realtime echo's own content match
      const echoIdx = prev.findIndex((m) => m.id === realId);
      if (echoIdx === -1) {
        const next = prev.slice();
        next[tmpIdx] = { ...next[tmpIdx], id: realId };
        return next;
      }
      // The realtime echo for this exact send already landed under the real
      // id before insert()'s own REST response came back to us — these two
      // network round trips race, and the echo (already an open WebSocket
      // push) frequently wins over the REST round trip. Collapsing to a
      // single map() over tmpId (the old logic) would leave both rows in
      // state with the same id, a React key collision that renders as a
      // duplicated / stuck bubble. Keep exactly one row: prefer whichever
      // copy actually has content, since the echo can itself be the known
      // blank-payload race (see fetchMessageRowWithRetry) that hasn't
      // self-healed by the time we get here.
      const echo = prev[echoIdx];
      const tmp = prev[tmpIdx];
      const merged = echo.content ? echo : { ...echo, content: tmp.content };
      console.warn("[msg-send] realtime echo beat the insert() response, collapsed duplicate", {
        realId,
        echoHadContent: !!echo.content,
      });
      const keepAt = Math.min(tmpIdx, echoIdx);
      const next = prev.filter((_, i) => i !== tmpIdx && i !== echoIdx);
      next.splice(keepAt, 0, merged);
      return next;
    });
    setSelectedIds((prev) => {
      if (!prev.has(tmpId)) return prev;
      const next = new Set(prev);
      next.delete(tmpId);
      next.add(realId);
      return next;
    });
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

    console.debug("[msg-send] inserting", tmpId);
    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: finalContent,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      // Roll back optimistic message on failure
      console.error("[msg-send] insert failed", error);
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
      toast({ title: "Failed to send", description: error?.message ?? "Please try again.", variant: "destructive" });
      return;
    }
    // Adopt the real row id immediately instead of waiting for the realtime
    // echo to reconcile this optimistic message by content-string match —
    // that match silently fails if the echo's payload ever arrives blank (a
    // replication-lag race — see fetchMessageRowWithRetry above), which used
    // to leave the message stuck under its temporary id forever: every
    // action on it (delete/copy/forward) targets an id no row has, so it
    // quietly no-ops instead of doing anything.
    adoptRealId(tmpId, inserted.id);
    console.debug("[msg-send] persisted", inserted.id);
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

  const onEmojiClick = (data: EmojiClickData) => {
    if (pendingFile) setText((prev) => prev + data.emoji);
    else onType(text + data.emoji);
  };

  // Selection / actions
  const selectedList = useMemo(
    () => messages.filter((m) => selectedIds.has(m.id)),
    [selectedIds, messages],
  );
  const selectionCount = selectedList.length;
  const onlySelected = selectionCount === 1 ? selectedList[0] : null;
  // Mobile browsers can dispatch a stray/ghost click shortly after a real
  // long-press (synthetic mouse-compat events, or a real click landing on
  // whatever element ends up under the original touch point once the
  // screen reflows into selection mode) — see #18/#20/#21. Rather than
  // keep chasing every place such a click could originate or land,
  // guard the action itself: a selection that was *just* created by a
  // long-press can't be wiped by anything for a short window afterward.
  const longPressGuardUntil = useRef(0);
  const clearSelection = () => {
    if (Date.now() < longPressGuardUntil.current) return;
    setSelectedIds(new Set());
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectFromLongPress = (id: string) => {
    longPressGuardUntil.current = Date.now() + 500;
    toggleSelect(id);
  };

  // Jump from a search result straight to that message in the full chat —
  // closes search (so reopening it always starts a fresh search, per how
  // this is meant to work) and briefly highlights the target so it's easy
  // to spot after the scroll.
  const jumpToMessage = (id: string) => {
    setSearchOpen(false);
    setSearchQuery("");
    requestAnimationFrame(() => {
      messageRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setHighlightId(id);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 1600);
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
    try {
      if (m.content.startsWith(VOICE_PREFIX)) {
        await navigator.clipboard.writeText(m.content.slice(VOICE_PREFIX.length));
        toast({ title: "Copied" });
      } else if (m.content.startsWith(FILE_PREFIX)) {
        const meta = parseFileMessage(m.content);
        let copiedImage = false;
        if (meta?.mime.startsWith("image/") && "ClipboardItem" in window) {
          try {
            // Pass a pending Blob promise, not an already-resolved one, so
            // navigator.clipboard.write() itself is invoked synchronously
            // within this click handler. Browsers (Chrome/Android especially)
            // only allow clipboard-write inside the original tap's transient
            // activation window — awaiting the signed-URL fetch *before*
            // calling write() let that window lapse on the slower/higher-
            // latency mobile network path, which is why image copy worked
            // reliably on desktop but silently failed (or no-oped) on mobile.
            const blobPromise = getSignedChatMediaUrl(meta.url).then((u) =>
              fetch(u).then((res) => res.blob()),
            );
            await navigator.clipboard.write([
              new ClipboardItem({ [meta.mime]: blobPromise as unknown as Promise<Blob> }),
            ]);
            copiedImage = true;
          } catch {
            // Fall back to copying the link below.
          }
        }
        if (!copiedImage) {
          const url = meta ? await getSignedChatMediaUrl(meta.url) : null;
          await navigator.clipboard.writeText(url ?? meta?.name ?? "");
        }
        toast({ title: copiedImage ? "Image copied" : "Link copied" });
      } else {
        await navigator.clipboard.writeText(m.content);
        toast({ title: "Copied" });
      }
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
    } catch (e) {
      // AbortError just means the user closed the native share sheet without
      // picking anything — not a failure worth surfacing. Everything else
      // (e.g. a stricter mobile browser rejecting the call) was previously
      // swallowed by an empty catch, which looked exactly like the Share
      // button silently doing nothing on mobile.
      if (e instanceof Error && e.name !== "AbortError") {
        toast({ title: "Share failed", description: e.message, variant: "destructive" });
      }
    }
    clearSelection();
  };
  const replyMsg = (m: Message) => {
    setReplyTo(m);
    clearSelection();
  };
  const cancelReply = () => setReplyTo(null);

  // Voice notes
  const startRecording = async () => {
    const prereqError = checkMicPrerequisites();
    if (prereqError) {
      toast({ title: "Can't record voice", description: prereqError, variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecordingMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      // Store the bare type (no ";codecs=..." parameter) — that parameter is
      // only meaningful to MediaRecorder for picking a codec, not to the
      // Blob that gets uploaded and later played back/transcribed.
      recMimeTypeRef.current = baseMimeType(rec.mimeType || mimeType || "audio/webm");
      recChunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && recChunks.current.push(e.data);
      // onstop is (re)assigned by stopRecording right before it's called, based
      // on which button ended the recording — send as a voice note, transcribe
      // to text, or discard. No default handler needed here.
      rec.start();
      recorderRef.current = rec;
      recStreamRef.current = stream;
      setRecording(true);
      setRecSec(0);
      recTimer.current = window.setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch (e) {
      const { title, description } = describeMicError(e);
      toast({ title, description, variant: "destructive" });
    }
  };
  const stopRecording = (mode: "send" | "cancel" | "transcribe" = "send") => {
    const r = recorderRef.current;
    if (!r) return;
    r.onstop = async () => {
      r.stream.getTracks().forEach((t) => t.stop());
      recStreamRef.current = null;
      if (recTimer.current) window.clearInterval(recTimer.current);
      const blob = new Blob(recChunks.current, { type: recMimeTypeRef.current });
      setRecSec(0);
      if (mode === "send") await uploadVoice(blob);
      else if (mode === "transcribe") await transcribeAndFill(blob);
    };
    r.stop();
    setRecording(false);
  };
  const transcribeAndFill = async (blob: Blob) => {
    if (blob.size === 0 || !isVoiceTranscribeEnabled()) return;
    setTranscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke("transcribe-voice", { body: blob });
      if (error) throw error;
      const transcript = (data as { text?: string } | null)?.text?.trim();
      if (!transcript) {
        toast({
          title: "Couldn't hear anything",
          description: "Try recording again, a bit closer to the mic.",
          variant: "destructive",
        });
        return;
      }
      setText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
    } catch (e) {
      toast({
        title: "Transcription failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setTranscribing(false);
    }
  };
  const uploadVoice = async (blob: Blob) => {
    if (!user || !conversationId) return;
    console.debug("[voice-send] start", { size: blob.size, type: blob.type });
    // Optimistic, same pattern send() already uses for text — without this,
    // voice notes only appeared once the realtime INSERT event echoed back,
    // which could lag or silently miss, leaving the sender staring at their
    // own chat with nothing there until a manual refresh.
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localUrl = URL.createObjectURL(blob);
    const optimistic: Message = {
      id: tmpId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: `${VOICE_PREFIX}${localUrl}`,
      created_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      edited_at: null,
      deleted_for_everyone: false,
    };
    setMessages((prev) => [...prev, optimistic]);

    const ext = extensionForMimeType(blob.type);
    const path = `${user.id}/${conversationId}/${Date.now()}.${ext}`;
    console.debug("[voice-send] uploading to storage", path);
    const { error: upErr } = await supabase.storage
      .from("chat-media")
      .upload(path, blob, { contentType: blob.type || "audio/webm" });
    if (upErr) {
      console.error("[voice-send] storage upload failed", upErr);
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
      URL.revokeObjectURL(localUrl);
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
    const finalContent = `${VOICE_PREFIX}${pub.publicUrl}`;
    // Swap the placeholder to the real URL now, still under the tmp- id.
    setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, content: finalContent } : m)));
    URL.revokeObjectURL(localUrl);
    console.debug("[voice-send] uploaded, inserting message row", finalContent);
    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: finalContent,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      console.error("[voice-send] insert failed", error);
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
      toast({ title: "Send failed", description: error?.message ?? "Please try again.", variant: "destructive" });
      return;
    }
    // Adopt the real row id immediately — see the matching comment in
    // send() for why waiting on the realtime echo's content-match to
    // reconcile this is what left voice notes stuck "sending" forever with
    // delete/copy/forward silently doing nothing.
    adoptRealId(tmpId, inserted.id);
    console.debug("[voice-send] persisted", inserted.id);
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
    // Same optimistic pattern as text/voice — show the attachment immediately
    // using the local preview URL already sitting in pendingFile, instead of
    // waiting on the realtime echo.
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticContent = encodeFileMessage({
      url: pendingFile.previewUrl,
      mime: f.type || "application/octet-stream",
      name: f.name,
      size: f.size,
      caption,
    });
    setMessages((prev) => [
      ...prev,
      {
        id: tmpId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: optimisticContent,
        created_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        edited_at: null,
        deleted_for_everyone: false,
      },
    ]);
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
      // Swap to the real URL, still under the tmp- id.
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, content } : m)));
      const { data: inserted, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content,
        })
        .select("id")
        .single();
      if (error || !inserted) throw error ?? new Error("Insert failed");
      // Adopt the real row id immediately — see the matching comment in
      // send() for why relying on the realtime echo's content-match to
      // reconcile this is fragile.
      adoptRealId(tmpId, inserted.id);
      URL.revokeObjectURL(pendingFile.previewUrl);
      setPendingFile(null);
      setText("");
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
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
                aria-label="Share"
                onClick={() => shareMsgs(selectedList.filter((m) => !m.deleted_for_everyone))}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Share2 className="w-4 h-4 text-foreground" />
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
                <div
                  key={m.id}
                  ref={(el) => {
                    if (el) messageRefs.current.set(m.id, el);
                    else messageRefs.current.delete(m.id);
                  }}
                  className={`transition-colors rounded-2xl ${highlightId === m.id ? "bg-accent/25" : ""}`}
                >
                  <CallRow
                    mine={mine}
                    isSelected={isSelected}
                    onTap={() => {
                      if (searchOpen) jumpToMessage(m.id);
                      else if (selectionCount > 0) toggleSelect(m.id);
                    }}
                    onLongPress={() => selectFromLongPress(m.id)}
                  >
                    <CallSystemBubble
                      m={m}
                      mine={mine}
                      otherName={other?.display_name}
                      onCallBack={(t) => setCallSheet(t)}
                    />
                  </CallRow>
                </div>
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
              <div
                key={m.id}
                ref={(el) => {
                  if (el) messageRefs.current.set(m.id, el);
                  else messageRefs.current.delete(m.id);
                }}
                className={`transition-colors rounded-2xl ${highlightId === m.id ? "bg-accent/25" : ""}`}
              >
              <SwipeRow
                mine={mine}
                onReply={() => replyMsg(m)}
                onTap={(e) => {
                  e.stopPropagation();
                  if (searchOpen) {
                    jumpToMessage(m.id);
                    return;
                  }
                  // In selection mode, tap toggles. Otherwise tap does nothing
                  // (selection requires long-press to avoid accidental opens).
                  if (selectionCount > 0) toggleSelect(m.id);
                }}
                onLongPress={() => selectFromLongPress(m.id)}
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
                      className={`mb-1 px-2 py-1 rounded-md border-l-2 text-xs line-clamp-4 whitespace-pre-wrap break-words ${
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
                    <p className="text-base whitespace-pre-wrap break-words leading-snug">
                      {body}
                      <span
                        className={`float-right inline-flex items-center gap-1 ml-2 mt-1 text-[10px] leading-none whitespace-nowrap ${
                          mine ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {m.edited_at && <span>edited</span>}
                        <span>{formatTime(m.created_at)}</span>
                        {mine && (
                          m.read_at ? (
                            <CheckCheck className="w-3 h-3 text-sky-400" />
                          ) : m.delivered_at ? (
                            <CheckCheck className="w-3 h-3 text-primary-foreground/70" />
                          ) : (
                            <Check className="w-3 h-3 text-primary-foreground/70" />
                          )
                        )}
                      </span>
                    </p>
                  )}
                  {!bareAttachment && (isDeleted || isVoice || isFile) && (
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
              </div>
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
          {transcribing ? (
            <div className="flex-1 flex items-center gap-2 px-3 h-9 rounded-md bg-input border border-border">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground">Transcribing…</span>
            </div>
          ) : recording ? (
            <>
              <button
                onClick={() => stopRecording("cancel")}
                aria-label="Cancel recording"
                className="w-9 h-9 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-foreground" />
              </button>
              <div className="flex-1 flex items-center gap-2 px-2 h-9 rounded-md bg-input border border-border overflow-hidden">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse shrink-0" />
                <span className="text-xs text-foreground shrink-0 tabular-nums">{fmtDuration(recSec)}</span>
                <VoiceRecorderBar stream={recStreamRef.current} />
              </div>
              {isVoiceTranscribeEnabled() && (
                <button
                  onClick={() => stopRecording("transcribe")}
                  aria-label="Convert to text"
                  title="Convert to text"
                  className="w-9 h-9 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center"
                >
                  <Type className="w-4 h-4 text-foreground" />
                </button>
              )}
              <button
                onClick={() => stopRecording("send")}
                aria-label="Send voice note"
                className="w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center"
              >
                <Send className="w-4 h-4 text-primary-foreground" />
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
                ref={composerInputRef}
                value={text}
                onChange={(e) => (pendingFile ? setText(e.target.value) : onType(e.target.value))}
                onFocus={() => setEmojiOpen(false)}
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
                className="h-10 text-base md:text-base bg-input border-border"
              />
              {!pendingFile && (
                <button
                  onClick={() => {
                    composerInputRef.current?.blur();
                    setEmojiOpen((v) => !v);
                  }}
                  aria-label="Emoji"
                  className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center"
                >
                  <Smile className="w-4 h-4 text-foreground" />
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
        {emojiOpen && (
          <div className="border-t border-border bg-background h-[300px] overflow-hidden shrink-0">
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              theme={resolvedTheme === "dark" ? EmojiTheme.DARK : EmojiTheme.LIGHT}
              width="100%"
              height={300}
              searchDisabled
              skinTonesDisabled
              previewConfig={{ showPreview: false }}
            />
          </div>
        )}
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
