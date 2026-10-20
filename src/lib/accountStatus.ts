import { supabase } from "@/integrations/supabase/client";
import { getCallsSnapshot, requestEndCall } from "@/lib/activeCall";
import { unregisterCallPush } from "@/lib/fcmRegistration";
import { callRpc } from "@/lib/rpc";

export const SUSPENDED_PATH = "/account-suspended";

type DbRefusal = { message?: string; hint?: string } | null | undefined;

/** The database refused because this account is suspended. */
export function isSuspendedError(err: unknown): boolean {
  const e = err as DbRefusal;
  return !!e && (e.hint === "chichat_suspended" || e.message === "suspended");
}

/** The database refused because a daily/hourly limit for new chats or calls was reached. */
export function isLimitError(err: unknown): boolean {
  const e = err as DbRefusal;
  return !!e && (e.hint === "chichat_limit" || e.message === "limit");
}

/** Sign-up or a phone number refused because the details belong to a suspended account. */
export function isBannedError(err: unknown): boolean {
  const e = err as DbRefusal;
  const text = `${e?.message ?? ""} ${e?.hint ?? ""}`;
  return /chichat_banned|account_not_allowed|phone_not_allowed/i.test(text);
}

/** "suspended", "active", or null when it couldn't be checked (offline, older server). */
export async function fetchMyAccountStatus(): Promise<"suspended" | "active" | null> {
  const { data, error } = await callRpc<string>("get_my_account_status");
  if (error) return null;
  return data === "suspended" ? "suspended" : "active";
}

let leaving = false;

/** Ends calls, stops ringing on this phone, signs out here, and shows the suspended screen. */
export async function leaveSuspendedAccount(): Promise<void> {
  if (leaving) return;
  leaving = true;
  try {
    getCallsSnapshot().calls.forEach((c) => requestEndCall(c.callId));
    try {
      await unregisterCallPush();
    } catch {
      /* the token may already be gone */
    }
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* already signed out */
    }
  } finally {
    window.location.replace(SUSPENDED_PATH);
  }
}

const listeners = new Set<() => void>();

/** Ask for an immediate check (e.g. right after the database refused something). */
export function requestAccountCheck(): void {
  listeners.forEach((l) => l());
}

export function onAccountCheckRequested(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** False only when the server says these details belong to a suspended account. */
export async function signupAllowed(email: string, phone: string | null): Promise<boolean> {
  const { data, error } = await callRpc<boolean>("signup_allowed", { _email: email, _phone: phone ?? "" });
  return error ? true : data !== false;
}
