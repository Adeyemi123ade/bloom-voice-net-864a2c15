import { supabase } from "@/integrations/supabase/client";

export type EmailStatus = {
  exists: boolean;
  deleted: boolean;
} | null;

/**
 * Asks the backend whether an email is registered, and (when it isn't)
 * whether it belonged to a deleted account.
 * Returns null on any failure so the UI can stay silent rather than mislead.
 */
export async function checkEmailStatus(email: string): Promise<EmailStatus> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return null;
  try {
    const { data, error } = await supabase.functions.invoke("check-email-exists", {
      body: { email: trimmed },
    });
    if (error || !data || typeof (data as { exists?: unknown }).exists !== "boolean") {
      return null;
    }
    const d = data as { exists: boolean; deleted?: boolean };
    return { exists: d.exists, deleted: !!d.deleted };
  } catch {
    return null;
  }
}

/**
 * Backwards-compatible boolean check used by older callers.
 */
export async function checkEmailExists(email: string): Promise<boolean | null> {
  const status = await checkEmailStatus(email);
  return status ? status.exists : null;
}
