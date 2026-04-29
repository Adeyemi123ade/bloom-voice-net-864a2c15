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

export async function setAutoBackup(enabled: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("chat_backups").upsert(
    { user_id: user.id, auto_backup_enabled: enabled },
    { onConflict: "user_id" },
  );
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
