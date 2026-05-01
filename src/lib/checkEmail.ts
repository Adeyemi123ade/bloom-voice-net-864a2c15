import { supabase } from "@/integrations/supabase/client";

/**
 * Asks the backend whether an email is already registered.
 * Returns null on any failure so the UI can stay silent rather than mislead.
 */
export async function checkEmailExists(email: string): Promise<boolean | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return null;
  try {
    const { data, error } = await supabase.functions.invoke("check-email-exists", {
      body: { email: trimmed },
    });
    if (error || !data || typeof (data as { exists?: unknown }).exists !== "boolean") {
      return null;
    }
    return (data as { exists: boolean }).exists;
  } catch {
    return null;
  }
}
