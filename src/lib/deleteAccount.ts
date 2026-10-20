import { supabase } from "@/integrations/supabase/client";

/**
 * Permanently deletes the signed-in account and its data through the
 * delete-account function (the only supported way), then signs out here.
 * Returns false when it didn't work; never throws.
 */
export async function deleteMyAccount(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("delete-account");
    const result = data as { ok?: boolean; error?: string; detail?: string } | null;
    if (error || !result?.ok) {
      console.error("[delete-account] failed", error ?? result);
      return false;
    }
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* the account is gone; nothing to sign out */
    }
    return true;
  } catch (e) {
    console.error("[delete-account] failed", e);
    return false;
  }
}
