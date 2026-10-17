// Block, report and message requests (client side).
//
// The database is what enforces a block (see migration
// 20261017140000_block_report_requests.sql): messages and calls between
// blocked people are refused there. This file keeps a small in-memory copy
// of "who I blocked" so screens can show the right controls at once.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadCachedContacts, loadManualContacts } from "@/lib/deviceContacts";

// ── Blocks ──────────────────────────────────────────────────────────────

let myBlocks: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export async function loadMyBlocks(force = false): Promise<Set<string>> {
  if (myBlocks && !force) return myBlocks;
  if (loading && !force) return loading;
  loading = (async () => {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) return new Set<string>();
    const { data, error } = await supabase
      .from("blocked_users")
      .select("blocked_id")
      .eq("blocker_id", me);
    if (error) {
      console.error("[safety] could not load blocks", error);
      return myBlocks ?? new Set<string>();
    }
    myBlocks = new Set((data ?? []).map((r) => r.blocked_id));
    notify();
    return myBlocks;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

/** Forget the cached list (on sign out). */
export function clearSafetyCache() {
  myBlocks = null;
  contactIds = null;
  notify();
}

export async function blockUser(userId: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me || me === userId) return false;
  const { error } = await supabase
    .from("blocked_users")
    .upsert({ blocker_id: me, blocked_id: userId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
  if (error) {
    console.error("[safety] block failed", error);
    return false;
  }
  (myBlocks ??= new Set()).add(userId);
  notify();
  return true;
}

export async function unblockUser(userId: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return false;
  const { error } = await supabase
    .from("blocked_users")
    .delete()
    .eq("blocker_id", me)
    .eq("blocked_id", userId);
  if (error) {
    console.error("[safety] unblock failed", error);
    return false;
  }
  myBlocks?.delete(userId);
  notify();
  return true;
}

/** React hook: has the signed-in person blocked `userId`? */
export function useIsBlocked(userId: string | null | undefined): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    void loadMyBlocks();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return !!userId && !!myBlocks?.has(userId);
}

/** React hook: everyone the signed-in person blocked (ids). */
export function useMyBlocks(): string[] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    void loadMyBlocks(true);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return myBlocks ? Array.from(myBlocks) : [];
}

/** True when a database error is the "blocked" refusal. */
export function isBlockedError(err: unknown): boolean {
  const e = err as { message?: string; hint?: string } | null;
  return !!e && (e.hint === "chichat_blocked" || e.message === "blocked");
}

// ── Reports ─────────────────────────────────────────────────────────────

export type ReportReason = "spam" | "harassment" | "inappropriate" | "scam" | "violence" | "other";

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: "spam", label: "Spam" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "inappropriate", label: "Inappropriate or sexual content" },
  { id: "scam", label: "Scam or fake account" },
  { id: "violence", label: "Threats or violence" },
  { id: "other", label: "Something else" },
];

export async function submitReport(input: {
  reportedUserId: string;
  conversationId?: string | null;
  messageId?: string | null;
  reason: ReportReason;
  details?: string;
  alsoBlock?: boolean;
}): Promise<boolean> {
  if (input.alsoBlock) await blockUser(input.reportedUserId);
  const { data, error } = await supabase.functions.invoke("submit-report", {
    body: {
      reportedUserId: input.reportedUserId,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      reason: input.reason,
      details: input.details ?? "",
      alsoBlocked: !!input.alsoBlock,
    },
  });
  if (error || !data?.ok) {
    console.error("[safety] report failed", error ?? data);
    return false;
  }
  return true;
}

// ── Message requests ────────────────────────────────────────────────────

// ChiChat users matched from this phone's saved contacts (same matching the
// Contacts screen and Contact info use). Phone numbers of other users are
// hidden by the database, so this is the only way to know.
let contactIds: Set<string> | null = null;
let contactsLoading: Promise<Set<string>> | null = null;

export async function loadContactUserIds(): Promise<Set<string>> {
  if (contactIds) return contactIds;
  if (contactsLoading) return contactsLoading;
  contactsLoading = (async () => {
    const local = [...(loadCachedContacts() ?? []), ...loadManualContacts()];
    const phones = Array.from(new Set(local.flatMap((c) => c.phones).filter(Boolean)));
    if (phones.length === 0) return new Set<string>();
    const { data, error } = await supabase.rpc("match_contacts_by_phone", { _phones: phones });
    if (error) {
      console.error("[safety] contact match failed", error);
      return new Set<string>();
    }
    contactIds = new Set((data ?? []).map((m: { user_id: string }) => m.user_id));
    return contactIds;
  })();
  try {
    return await contactsLoading;
  } finally {
    contactsLoading = null;
  }
}

const ACCEPTED_KEY = "chichat:acceptedChats";

function readAcceptedLocal(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(ACCEPTED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function rememberAcceptedLocal(conversationId: string) {
  try {
    const s = readAcceptedLocal();
    s.add(conversationId);
    localStorage.setItem(ACCEPTED_KEY, JSON.stringify(Array.from(s).slice(-500)));
  } catch {
    /* storage unavailable: the database copy still holds it */
  }
}

/**
 * Is this chat a message request for me? Yes when the other person wrote,
 * is not in my saved contacts, I have never sent a message in it, and I haven't
 * accepted it before. Answers "no" whenever unsure, so a known chat is
 * never hidden behind a request screen by mistake.
 */
export async function isMessageRequest(opts: {
  conversationId: string;
  otherUserId: string;
  iHaveSent: boolean;
  theyHaveSent: boolean;
}): Promise<boolean> {
  // Only a chat the other person started (they wrote, I never did).
  if (opts.iHaveSent || !opts.theyHaveSent) return false;
  if (readAcceptedLocal().has(opts.conversationId)) return false;
  try {
    const contacts = await loadContactUserIds();
    if (contacts.has(opts.otherUserId)) return false;
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) return false;
    const { data, error } = await supabase
      .from("accepted_chats")
      .select("conversation_id")
      .eq("user_id", me)
      .eq("conversation_id", opts.conversationId)
      .maybeSingle();
    if (error) return false;
    if (data) {
      rememberAcceptedLocal(opts.conversationId);
      return false;
    }
    // Did I ever send something here (older than the loaded page)?
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", opts.conversationId)
      .eq("sender_id", me);
    if ((count ?? 0) > 0) return false;
    return true;
  } catch {
    return false;
  }
}

export async function acceptChat(conversationId: string): Promise<void> {
  rememberAcceptedLocal(conversationId);
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return;
  const { error } = await supabase
    .from("accepted_chats")
    .upsert({ user_id: me, conversation_id: conversationId }, { onConflict: "user_id,conversation_id", ignoreDuplicates: true });
  if (error) console.error("[safety] accept failed", error);
}
