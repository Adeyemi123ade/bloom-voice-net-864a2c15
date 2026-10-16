import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Send, Check, CheckCheck, Mic, Trash2, Pencil, X,
  Paperclip, Copy, Share2, Forward, Phone, Video, Smile, MoreVertical, Search, Info,
  Type, Loader2,
} from "lucide-react";
import ForwardSheet, { type ForwardResult } from "@/components/chat/ForwardSheet";
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
import { activeCallPath, getActiveCall } from "@/lib/activeCall";
import { isReallyOnline } from "@/lib/presence";
import { pickRecordingMimeType, extensionForMimeType, baseMimeType } from "@/lib/audioMime";
import { checkMicPrerequisites, describeMicError } from "@/lib/micPermission";
import { isVoiceTranscribeEnabled } from "@/lib/transcriptionPrefs";
import { beginOutgoingCall } from "@/lib/callStart";
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
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { messageKind, mediaLabel, parseCallLog, selectionActions, stripQuotedReply } from "@/lib/chat/messageKinds";
import { checkClipAvailable, copyMessages, extractTypedClip, matchPastedClip, mediaUrlOf } from "@/lib/chat/clipboard";
import { getSignedChatMediaUrl, useSignedMediaUrl } from "@/lib/signedMedia";
import { Capacitor } from "@capacitor/core";
import { pushNewMessage } from "@/lib/pushNotify";

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

/** Messages loaded at a time: the latest page on open, older pages on scroll up. */
const PAGE_SIZE = 50;

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
  const { showBackArrow, goBack } = useBackNavigation("/home");
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
  const [forwardOpen, setForwardOpen] = useState(false);
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
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  // Phones (coarse pointer): Enter adds a new line and the Send button sends,
  // like WhatsApp. Keyboard/mouse devices: Enter sends, Shift+Enter = new line.
  const enterAddsNewLine = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
    [],
  );
  const [emojiOpen, setEmojiOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<number | null>(null);
  const [pendingFile, setPendingFile] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  // A voice note / photo / video / document pasted from an in-app copy. It
  // points at the already-stored file, so sending it uploads nothing.
  const [pendingClip, setPendingClip] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    document.title = other?.display_name ? `${other.display_name} — Chichat` : "Chat — Chichat";
  }, [other]);

  useEffect(() => {
    if (conversationId) setHidden(loadHidden(conversationId));
  }, [conversationId]);

  // ── Message history, a page at a time ──────────────────────────────────
  // Opening a chat loads only its latest PAGE_SIZE messages; scrolling to
  // the top loads the next older page. Search and Clear chat need the whole
  // history, so they load the rest first (loadAllMessages).
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasOlderRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  // Distance from the bottom to restore after older messages are added above.
  const keepBottomOffset = useRef<number | null>(null);
  const setOlder = (v: boolean) => {
    hasOlderRef.current = v;
    setHasOlder(v);
  };
  /** Oldest loaded message's time (server rows only, not unsent ones). */
  const oldestLoadedAt = () => messagesRef.current.find((m) => !m.id.startsWith("tmp-"))?.created_at ?? null;

  useEffect(() => {
    if (!user || !conversationId) return;
    let cancelled = false;
    setOlder(false);
    // The other person's profile and the messages load at the same time.
    void (async () => {
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", user.id);
      const otherId = parts?.[0]?.user_id;
      if (!otherId) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, is_online, last_seen_at, show_last_seen")
        .eq("id", otherId)
        .maybeSingle();
      if (prof && !cancelled) setOther(prof as Profile);
    })();
    void (async () => {
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      const rows = (msgs ?? []).slice().reverse();
      const fixed = await reconcileBlankRows(rows);
      if (cancelled) return;
      setOlder(rows.length === PAGE_SIZE);
      setMessages(fixed);
    })();
    // Opening the chat reads all of it, including messages older than the
    // page shown, so the chat list badge clears completely.
    void markConversationRead();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, conversationId]);

  /** Older messages than those loaded: one page, or all of them. */
  const fetchOlder = async (all: boolean): Promise<Message[]> => {
    const oldest = oldestLoadedAt();
    let q = supabase.from("messages").select("*").eq("conversation_id", conversationId!);
    if (oldest) q = q.lte("created_at", oldest);
    const { data } = all
      ? await q.order("created_at", { ascending: true })
      : await q.order("created_at", { ascending: false }).limit(PAGE_SIZE + 1);
    const rows = all ? data ?? [] : (data ?? []).slice().reverse();
    // lte so messages sharing the oldest time aren't skipped; drop the ones
    // already shown.
    const have = new Set(messagesRef.current.map((m) => m.id));
    const fresh = rows.filter((r) => !have.has(String(r.id)));
    if (all || rows.length <= PAGE_SIZE) setOlder(false);
    return reconcileBlankRows(fresh);
  };

  const prepend = (older: Message[]) => {
    if (older.length === 0) return;
    const el = scrollRef.current;
    if (el) keepBottomOffset.current = el.scrollHeight - el.scrollTop;
    setMessages((prev) => {
      const have = new Set(prev.map((m) => m.id));
      return [...older.filter((m) => !have.has(m.id)), ...prev];
    });
  };

  const loadOlderMessages = async () => {
    if (!conversationId || !hasOlderRef.current || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      prepend(await fetchOlder(false));
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  };

  /** The whole history (for search and Clear chat). Returns every message. */
  const loadAllMessages = async (): Promise<Message[]> => {
    if (!conversationId) return messagesRef.current;
    if (hasOlderRef.current) {
      const older = await fetchOlder(true);
      const have = new Set(messagesRef.current.map((m) => m.id));
      const all = [...older.filter((m) => !have.has(m.id)), ...messagesRef.current];
      prepend(older);
      return all;
    }
    return messagesRef.current;
  };

  // Keep the same messages in view when older ones are added above them.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || keepBottomOffset.current === null) return;
    el.scrollTop = el.scrollHeight - keepBottomOffset.current;
    keepBottomOffset.current = null;
  }, [messages]);

  // Near the top: load the previous page. Also when the first page is too
  // short to scroll at all.
  const onMessagesScroll = () => {
    const el = scrollRef.current;
    if (el && el.scrollTop < 160) void loadOlderMessages();
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (el && hasOlder && el.scrollHeight <= el.clientHeight + 40) void loadOlderMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOlder, messages.length]);

  /** Delivered + read for every incoming message of this chat, in one request each. */
  const markConversationRead = async () => {
    if (!user || !conversationId) return;
    const now = new Date().toISOString();
    await Promise.all([
      supabase
        .from("messages")
        .update({ delivered_at: now })
        .eq("conversation_id", conversationId)
        .neq("sender_id", user.id)
        .is("delivered_at", null),
      supabase
        .from("messages")
        .update({ read_at: now })
        .eq("conversation_id", conversationId)
        .neq("sender_id", user.id)
        .is("read_at", null),
    ]);
  };

  useEffect(() => {
    if (!user || !conversationId) return;
    // New incoming messages while the chat is open: mark delivered and read.
    const pending = messages.some(
      (m) => m.sender_id !== user.id && !m.id.startsWith("tmp-") && (!m.delivered_at || !m.read_at),
    );
    if (pending) void markConversationRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Only the range already on screen is fetched again (not the whole
    // history), and focus + visibility firing together count once.
    let lastResync = 0;
    const resync = async () => {
      if (Date.now() - lastResync < 2000) return;
      lastResync = Date.now();
      const oldest = oldestLoadedAt();
      let q = supabase.from("messages").select("*").eq("conversation_id", conversationId);
      if (oldest) q = q.gte("created_at", oldest);
      else q = q.order("created_at", { ascending: false }).limit(PAGE_SIZE);
      const { data } = oldest ? await q.order("created_at", { ascending: true }) : await q;
      if (!data) return;
      if (!oldest) data.reverse();
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

  const startCall = (type: "voice" | "video") => {
    if (!user || !conversationId || !other) return;
    // Opens the call screen at once; the setup carries on behind it. If a
    // call is already running it goes back to that call instead.
    beginOutgoingCall(
      {
        conversationId,
        calleeId: other.id,
        type,
        peer: { name: other.display_name ?? "Contact", avatarUrl: other.avatar_url },
      },
      navigate,
    );
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

  // Grow the message box with its text, up to ~6 lines (or 30% of the
  // screen when the keyboard leaves little room), then scroll inside it.
  useLayoutEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = Math.min(160, Math.round(window.innerHeight * 0.3));
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [text, pendingFile, editing]);

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
      // Quote a label for media, never the stored "[file]…" string.
      const preview = replyTo.content.startsWith(VOICE_PREFIX)
        ? "🎤 Voice note"
        : messageKind(replyTo.content) !== "text"
          ? `📎 ${mediaLabel(replyTo.content)}`
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
    pushNewMessage(inserted.id);
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
  // Long-press only ever ADDS to the selection. Toggling here meant any
  // second trigger for the same press (browser contextmenu + our timer)
  // immediately unselected the message again. Tapping still toggles.
  const selectFromLongPress = (id: string) => {
    longPressGuardUntil.current = Date.now() + 500;
    setSelectedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
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
    const ids = msgs.map((m) => m.id).filter((id) => !id.startsWith("tmp-"));
    if (ids.length === 0) {
      if (msgs.length) toast({ title: "Message is still sending", description: "Try again in a moment.", variant: "destructive" });
      return;
    }
    // Ask for the updated rows back: an update the database's access rules
    // block returns no error, just zero rows, which used to look like
    // success while the message stayed put for everyone else.
    const { data, error } = await supabase
      .from("messages")
      .update({ deleted_for_everyone: true, content: "" })
      .in("id", ids)
      .select("id");
    const done = new Set((data ?? []).map((r) => r.id));
    if (done.size) {
      setMessages((prev) =>
        prev.map((m) => (done.has(m.id) ? { ...m, deleted_for_everyone: true, content: "" } : m)),
      );
    }
    if (error || done.size < ids.length) {
      const missed = ids.length - done.size;
      toast({
        title: "Delete failed",
        description: error?.message ?? (missed === 1 ? "That message couldn't be deleted for everyone." : `${missed} messages couldn't be deleted for everyone.`),
        variant: "destructive",
      });
    }
    clearSelection();
  };
  const bulkDelete = async () => {
    if (!user) return;
    const mine = selectedList.filter((m) => m.sender_id === user.id && !m.deleted_for_everyone);
    const others = selectedList.filter((m) => m.sender_id !== user.id || m.deleted_for_everyone);
    if (mine.length) await deleteForEveryone(mine);
    if (others.length) deleteForMe(others);
  };
  // Copy keeps a reference to the original message (see lib/chat/clipboard),
  // so pasting it in any chat recreates a real voice note / photo / video /
  // document instead of a pasted link.
  const copyMsgs = async (msgs: Message[]) => {
    try {
      const result = await copyMessages(msgs.map((m) => m.content));
      if (result.ok) toast({ title: result.label });
      else toast({ title: "Can't copy", description: result.reason, variant: "destructive" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
    clearSelection();
  };
  // Share to other apps (WhatsApp, email, ...). Another app can't receive a
  // playable ChiChat message, so text goes as text and a voice note, photo,
  // video or document goes as its name plus a download link. Uses the
  // phone's share sheet in the Android app, the browser's elsewhere.
  const shareMsgs = async (msgs: Message[]) => {
    const parts = await Promise.all(
      msgs.map(async (m) => {
        if (messageKind(m.content) === "text") return stripQuotedReply(m.content);
        const url = mediaUrlOf(m.content);
        const link = url ? await getSignedChatMediaUrl(url).catch(() => url) : "";
        const meta = parseFileMessage(m.content);
        const name = messageKind(m.content) === "voice" ? "Voice note" : meta?.name ?? mediaLabel(m.content);
        return link ? `${name}: ${link}` : name;
      }),
    );
    const txt = parts.join("\n\n");
    try {
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import("@capacitor/share");
        await Share.share({ text: txt, dialogTitle: "Share" });
      } else if ((navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
        await navigator.share({ text: txt });
      } else {
        await navigator.clipboard.writeText(txt);
        toast({ title: "Copied to clipboard (share unavailable)" });
      }
    } catch (e) {
      // Closing the share sheet without picking anything isn't a failure.
      const msg = e instanceof Error ? e.message : String(e);
      if (!(e instanceof Error && e.name === "AbortError") && !/cancel/i.test(msg)) {
        toast({ title: "Share failed", description: msg, variant: "destructive" });
      }
    }
    clearSelection();
  };
  // Text to send when forwarding: the message itself, without the quoted
  // reply line it may carry (same as WhatsApp). Files and voice notes are
  // forwarded as-is, pointing at the same stored file.
  const forwardContents = useMemo(
    () =>
      selectedList
        .filter((m) => !m.deleted_for_everyone && !m.content.startsWith(CALL_PREFIX))
        .map((m) => stripQuotedReply(m.content))
        .filter((c) => c.trim().length > 0),
    [selectedList],
  );
  const finishForward = ({ sent, failed }: ForwardResult) => {
    setForwardOpen(false);
    clearSelection();
    // Only one toast shows at a time, so a partial result goes in one message.
    if (!failed.length) toast({ title: `Forwarded to ${sent.join(", ")}` });
    else
      toast({
        title: "Forward failed",
        description: `${sent.length ? `Sent to ${sent.join(", ")}. ` : ""}Couldn't forward to ${failed.join(", ")}. Please try again.`,
        variant: "destructive",
      });
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
    pushNewMessage(inserted.id);
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
    pushNewMessage(inserted.id);
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

  // Paste in the message box. A paste of something copied in ChiChat (voice
  // note, photo, video, document) becomes a staged attachment that reuses the
  // original stored file; a pasted image file from another app is staged
  // like a picked file; anything else pastes as text, as before.
  const onComposerPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (editing || pendingFile || pendingClip) return;
    const pastedText = e.clipboardData.getData("text/plain");
    const clip = pastedText ? matchPastedClip(pastedText) : null;
    if (clip) {
      e.preventDefault();
      setEmojiOpen(false);
      setPendingClip(clip.content);
      return;
    }
    const file = Array.from(e.clipboardData.files ?? [])[0];
    if (file && !pastedText) {
      e.preventDefault();
      const MAX = 25 * 1024 * 1024;
      if (file.size > MAX) {
        toast({ title: "File too large", description: "Max 25MB", variant: "destructive" });
        return;
      }
      setPendingFile({ file, previewUrl: URL.createObjectURL(file) });
    }
  };

  const onComposerChange = (value: string) => {
    if (!editing && !pendingFile && !pendingClip) {
      const typed = extractTypedClip(value, text);
      if (typed) {
        setEmojiOpen(false);
        setPendingClip(typed.clip.content);
        setText(typed.rest);
        return;
      }
    }
    if (pendingFile || pendingClip) setText(value);
    else onType(value);
  };

  const cancelClip = () => {
    setPendingClip(null);
    setText("");
  };

  const sendClip = async () => {
    if (!pendingClip || !user || !conversationId) return;
    const caption = text.trim();
    setUploading(true);
    try {
      const check = await checkClipAvailable(pendingClip);
      if (!check.ok) {
        toast({ title: "Can't paste this", description: check.reason, variant: "destructive" });
        setPendingClip(null);
        return;
      }
      // Files carry their caption inside the message; a voice note has none,
      // so any typed text goes as a separate message after it.
      const meta = parseFileMessage(pendingClip);
      const content = meta ? encodeFileMessage({ ...meta, caption }) : pendingClip;
      const rows = [{ conversation_id: conversationId, sender_id: user.id, content }];
      if (!meta && caption) rows.push({ conversation_id: conversationId, sender_id: user.id, content: caption });
      const { data: inserted, error } = await supabase.from("messages").insert(rows).select("*");
      if (error || !inserted?.length) throw error ?? new Error("Send failed");
      const fresh = inserted.map((r) => normalizeMessage(r as Record<string, unknown>));
      fresh.forEach((m) => pushNewMessage(m.id));
      setMessages((prev) => {
        const have = new Set(prev.map((m) => m.id));
        return [...prev, ...fresh.filter((m) => !have.has(m.id))];
      });
      setPendingClip(null);
      setText("");
    } catch (err) {
      toast({
        title: "Failed to send",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
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
  const clearChat = async () => {
    setClearChatOpen(false);
    // Hide the whole history, including messages not loaded yet.
    deleteForMe(await loadAllMessages());
  };
  // Search looks through the whole chat, so load the rest of it.
  useEffect(() => {
    if (searchOpen) void loadAllMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  // Which actions to offer is worked out from the types of everything
  // selected, and recalculated whenever an item is added or removed.
  const actions = useMemo(() => selectionActions(selectedList, user?.id), [selectedList, user?.id]);
  const actionable = actions.actionable as Message[];
  // While selecting (or picking a search result), a tap on a bubble must
  // only select it, never play a voice note or open a photo or file.
  const bubbleTapsBlocked = selectionCount > 0 || searchOpen;

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
            {actions.canCopy && (
              <button
                aria-label="Copy"
                onClick={() => copyMsgs(actionable)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Copy className="w-4 h-4 text-foreground" />
              </button>
            )}
            {actions.canShare && (
              <button
                aria-label="Share"
                onClick={() => shareMsgs(actionable)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Share2 className="w-4 h-4 text-foreground" />
              </button>
            )}
            {actions.canForward && forwardContents.length > 0 && (
              <button
                aria-label="Forward"
                onClick={() => setForwardOpen(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
              >
                <Forward className="w-4 h-4 text-foreground" />
              </button>
            )}
            {actions.canEdit && (
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
            {showBackArrow && (
              <button
                aria-label="Back"
                onClick={(e) => { e.stopPropagation(); goBack(); }}
                className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center hover:bg-secondary shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            )}
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
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary active:bg-secondary active:scale-90 transition-transform"
            >
              <Phone className="w-5 h-5 text-foreground" />
            </button>
            <button
              aria-label="Video call"
              onClick={(e) => { e.stopPropagation(); startCall("video"); }}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary active:bg-secondary active:scale-90 transition-transform"
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
        <div ref={scrollRef} onScroll={onMessagesScroll} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {loadingOlder && !searchOpen && (
            <p className="text-2xs text-muted-foreground text-center py-1" role="status">
              Loading earlier messages…
            </p>
          )}
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
                      // Outside selection mode a tap offers to call back,
                      // always behind a confirmation (never calls directly).
                      else setCallSheet(parseCallLog(m.content)?.callType ?? "voice");
                    }}
                    onLongPress={() => selectFromLongPress(m.id)}
                  >
                    <CallSystemBubble m={m} mine={mine} />
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
                    bubbleTapsBlocked ? "pointer-events-none" : ""
                  } ${
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

        {/* Pasted voice note / photo / video / document (from an in-app copy) */}
        {pendingClip && !pendingFile && (
          <div
            className="px-3 py-2 bg-secondary/60 border-t border-border flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <PastedClipPreview content={pendingClip} />
            <button
              onClick={cancelClip}
              aria-label="Remove pasted item"
              className="w-7 h-7 rounded-full hover:bg-background flex items-center justify-center text-muted-foreground"
              disabled={uploading}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Composer — lifted above bottom edge */}
        <div
          className="px-3 pt-2 pb-4 border-t border-border flex items-end gap-2 bg-background"
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
              {!pendingFile && !pendingClip && (
                <button
                  onClick={() => fileRef.current?.click()}
                  aria-label="Attach file"
                  className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center"
                >
                  <Paperclip className="w-4 h-4 text-foreground" />
                </button>
              )}
              <textarea
                ref={composerInputRef}
                rows={1}
                value={text}
                onChange={(e) => onComposerChange(e.target.value)}
                onPaste={onComposerPaste}
                onFocus={() => setEmojiOpen(false)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey || enterAddsNewLine) return;
                  // Don't send while an input method (e.g. predictive text) is composing.
                  if (e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  if (pendingFile) sendPending();
                  else if (pendingClip) void sendClip();
                  else send();
                }}
                placeholder={
                  pendingFile || (pendingClip && messageKind(pendingClip) !== "voice")
                    ? "Add a caption (optional)…"
                    : editing
                      ? "Edit message"
                      : "Type a message"
                }
                disabled={uploading}
                aria-label="Message"
                className="flex-1 min-w-0 min-h-10 resize-none rounded-lg border-[1.5px] border-border bg-input px-3.5 py-[7px] text-base leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary disabled:opacity-50"
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
              {pendingFile || pendingClip ? (
                <button
                  onClick={() => (pendingFile ? sendPending() : void sendClip())}
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
      {forwardOpen && user && (
        <ForwardSheet
          userId={user.id}
          contents={forwardContents}
          onClose={() => setForwardOpen(false)}
          onDone={finishForward}
        />
      )}
      {deleteOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/30"
            onClick={() => setDeleteOpen(false)}
          />
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[61] w-[260px] rounded-xl bg-background border border-border shadow-lg overflow-hidden">
            {actions.canDeleteForEveryone && (
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

function PastedClipPreview({ content }: { content: string }) {
  const kind = messageKind(content);
  const meta = parseFileMessage(content);
  const url = useSignedMediaUrl(kind === "image" || kind === "video" ? mediaUrlOf(content) : null);
  const title = kind === "voice" ? "Voice note" : meta?.name ?? mediaLabel(content);
  const sub = kind === "voice" ? "Pasted voice note" : kind === "image" ? "Pasted photo" : kind === "video" ? "Pasted video" : "Pasted document";
  return (
    <>
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-background flex items-center justify-center flex-shrink-0">
        {kind === "image" && url ? (
          <img src={url} alt={title} className="w-full h-full object-cover" />
        ) : kind === "video" && url ? (
          <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
        ) : kind === "voice" ? (
          <Mic className="w-5 h-5 text-primary" />
        ) : (
          <Paperclip className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-foreground truncate">{title}</p>
        <p className="text-2xs text-muted-foreground">{sub}</p>
      </div>
    </>
  );
}
