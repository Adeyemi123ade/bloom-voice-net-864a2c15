import { useLanguage } from "@/lib/i18n/context";
import { tNow } from "@/lib/i18n/language";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Search, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pushNewMessage } from "@/lib/pushNotify";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Chat = {
  conversation_id: string;
  name: string;
  avatar_url: string | null;
};

export type ForwardResult = { sent: string[]; failed: string[] };

// Same limit WhatsApp uses, so one tap can't fan a message out to everyone.
const MAX_TARGETS = 5;

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}

/**
 * In-app Forward: pick one or more of your chats and send copies of the
 * selected messages there. Copies are new messages from you; attachments
 * reuse the same stored file, so nothing is uploaded again.
 */
export default function ForwardSheet({
  userId,
  contents,
  onClose,
  onDone,
}: {
  userId: string;
  /** Message bodies to forward, oldest first. */
  contents: string[];
  onClose: () => void;
  onDone: (result: ForwardResult) => void;
}) {
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: parts, error: e1 } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", userId);
      const ids = (parts ?? []).map((p) => p.conversation_id);
      if (e1 || ids.length === 0) {
        if (!cancelled) {
          setLoadError(e1 ? tNow("fwd.loadError") : null);
          setChats([]);
        }
        return;
      }
      const [{ data: convs, error: e2 }, { data: others, error: e3 }] = await Promise.all([
        supabase.from("conversations").select("id, last_message_at").in("id", ids).order("last_message_at", { ascending: false }),
        supabase.from("conversation_participants").select("conversation_id, user_id").in("conversation_id", ids).neq("user_id", userId),
      ]);
      const otherIds = Array.from(new Set((others ?? []).map((o) => o.user_id)));
      const { data: profiles, error: e4 } = otherIds.length
        ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", otherIds)
        : { data: [], error: null };
      if (cancelled) return;
      if (e2 || e3 || e4) {
        setLoadError("Couldn't load your chats.");
        setChats([]);
        return;
      }
      const prof = new Map((profiles ?? []).map((p) => [p.id, p]));
      const otherByConv = new Map((others ?? []).map((o) => [o.conversation_id, o.user_id]));
      const rows: Chat[] = [];
      for (const c of convs ?? []) {
        const p = prof.get(otherByConv.get(c.id) ?? "");
        if (!p) continue;
        rows.push({ conversation_id: c.id, name: p.display_name ?? tNow("chat.contact"), avatar_url: p.avatar_url ?? null });
      }
      setChats(rows);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (chats ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [chats, query]);

  const toggle = (id: string) =>
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_TARGETS ? prev : [...prev, id],
    );

  const send = async () => {
    if (!picked.length || sending) return;
    setSending(true);
    const nameOf = (id: string) => chats?.find((c) => c.conversation_id === id)?.name ?? "chat";
    const sent: string[] = [];
    const failed: string[] = [];
    for (const conversationId of picked) {
      let ok = true;
      let lastId: string | null = null;
      // One at a time so the messages arrive in their original order.
      for (const content of contents) {
        const { data, error } = await supabase
          .from("messages")
          .insert({ conversation_id: conversationId, sender_id: userId, content })
          .select("id")
          .single();
        if (error || !data) { ok = false; break; }
        lastId = data.id;
      }
      // One notification per chat, for the last forwarded message.
      pushNewMessage(lastId);
      (ok ? sent : failed).push(nameOf(conversationId));
    }
    setSending(false);
    onDone({ sent, failed });
  };

  return (
    <div
      className="absolute inset-0 z-[70] flex flex-col bg-background"
      role="dialog"
      aria-label={t("fwd.titleShort")}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="px-2 pt-4 pb-3 flex items-center gap-2 border-b border-border">
        <button
          aria-label={t("common.close")}
          onClick={onClose}
          disabled={sending}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground">{t("fwd.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {contents.length === 1 ? "1 message" : `${contents.length} messages`}
            {picked.length > 0 && ` · ${picked.length} selected`}
          </p>
        </div>
      </header>

      <div className="px-3 py-2">
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("fwd.search")}
            aria-label={t("fwd.search")}
            className="w-full h-10 rounded-lg border-[1.5px] border-border bg-input pl-9 pr-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {chats === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive text-center py-10 px-6">{loadError}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10 px-6">
            {query ? t("fwd.noMatch") : t("fwd.noChats")}
          </p>
        ) : (
          <ul>
            {visible.map((c) => {
              const on = picked.includes(c.conversation_id);
              const full = !on && picked.length >= MAX_TARGETS;
              return (
                <li key={c.conversation_id}>
                  <button
                    onClick={() => toggle(c.conversation_id)}
                    disabled={sending || full}
                    aria-pressed={on}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary disabled:opacity-50"
                  >
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={c.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-primary/20 text-foreground text-xs font-semibold">
                          {initials(c.name)}
                        </AvatarFallback>
                      </Avatar>
                      {on && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary border-2 border-background flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </span>
                      )}
                    </div>
                    <span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">{c.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {picked.length >= MAX_TARGETS && (
          <p className="text-xs text-muted-foreground text-center py-2">You can forward to up to {MAX_TARGETS} chats at a time.</p>
        )}
      </div>

      {picked.length > 0 && (
        <div className="px-4 py-3 border-t border-border flex items-center gap-3">
          <p className="flex-1 min-w-0 truncate text-sm text-foreground">
            {picked.map((id) => chats?.find((c) => c.conversation_id === id)?.name).filter(Boolean).join(", ")}
          </p>
          <button
            onClick={send}
            disabled={sending}
            aria-label={t("fwd.send")}
            className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-60"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      )}
    </div>
  );
}
