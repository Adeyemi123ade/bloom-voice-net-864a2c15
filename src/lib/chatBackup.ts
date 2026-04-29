import { supabase } from "@/integrations/supabase/client";

const LAST_AUTO_KEY = "chichat:backup:lastAutoAt";

export interface BackupRow {
  user_id: string;
  last_backup_at: string;
  message_count: number;
  media_count: number;
  total_bytes: number;
  manifest_path: string;
  auto_backup_enabled: boolean;
}

export async function getMyBackup(): Promise<BackupRow | null> {
  const { data } = await supabase.from("chat_backups").select("*").maybeSingle();
  return (data as BackupRow | null) ?? null;
}

export async function runBackup(): Promise<{ message_count: number; media_count: number }> {
  const { data, error } = await supabase.functions.invoke("chat-backup", {});
  if (error) throw error;
  localStorage.setItem(LAST_AUTO_KEY, new Date().toISOString());
  return { message_count: data?.message_count ?? 0, media_count: data?.media_count ?? 0 };
}

export async function runRestore(): Promise<{ restored: number; total: number }> {
  const { data, error } = await supabase.functions.invoke("chat-restore", {});
  if (error) throw error;
  return { restored: data?.restored ?? 0, total: data?.total ?? 0 };
}

/**
 * Returns true if the user has any messages newer than `lastBackupAt`
 * (i.e. there's something new worth backing up).
 */
export async function hasNewChangesSinceBackup(
  userId: string,
  lastBackupAt: string | null,
): Promise<boolean> {
  if (!lastBackupAt) return true;
  // Find conversations the user participates in.
  const { data: parts } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId);
  const ids = (parts ?? []).map((p) => p.conversation_id);
  if (ids.length === 0) return false;
  const { data, error } = await supabase
    .from("messages")
    .select("id", { head: true, count: "exact" })
    .in("conversation_id", ids)
    .gt("created_at", lastBackupAt)
    .limit(1);
  if (error) return true; // err on the side of trying
  // When head:true, supabase returns count via the response object — fall back
  // to a non-head check if needed.
  if (data && Array.isArray(data) && data.length > 0) return true;
  const { count } = await supabase
    .from("messages")
    .select("id", { head: true, count: "exact" })
    .in("conversation_id", ids)
    .gt("created_at", lastBackupAt);
  return (count ?? 0) > 0;
}

export async function setAutoBackup(enabled: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // Update existing row; if none yet, kick off a backup first so a row exists.
  const existing = await getMyBackup();
  if (!existing) {
    if (enabled) await runBackup();
    // After backup row exists, set the flag
    await supabase
      .from("chat_backups")
      .update({ auto_backup_enabled: enabled })
      .eq("user_id", user.id);
    return;
  }
  await supabase
    .from("chat_backups")
    .update({ auto_backup_enabled: enabled })
    .eq("user_id", user.id);
}

/** Run once per calendar day on app open if auto-backup is enabled. */
export async function maybeRunDailyBackup(): Promise<void> {
  try {
    const last = localStorage.getItem(LAST_AUTO_KEY);
    if (last) {
      const lastDay = new Date(last).toDateString();
      if (lastDay === new Date().toDateString()) return;
    }
    const row = await getMyBackup();
    // Default ON; only skip if explicitly disabled.
    if (row && row.auto_backup_enabled === false) return;
    await runBackup();
  } catch {
    /* silent */
  }
}
