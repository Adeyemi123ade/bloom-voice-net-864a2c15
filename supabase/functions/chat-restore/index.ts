// Restores chats from the user's backup manifest.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MsgRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  read_at?: string | null;
  deleted_for_everyone?: boolean | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: backup } = await admin
      .from("chat_backups").select("*").eq("user_id", user.id).maybeSingle();
    if (!backup) return json({ error: "No backup found" }, 404);

    const { data: file, error: dErr } = await admin.storage
      .from("backup-media").download(backup.manifest_path);
    if (dErr || !file) return json({ error: dErr?.message ?? "Manifest missing" }, 500);

    const manifest = JSON.parse(await file.text());
    const messages: MsgRow[] = manifest.messages ?? [];

    // Group by conversation. Re-create conversations the user no longer participates in.
    const convosToEnsure = new Set<string>();
    for (const m of messages) convosToEnsure.add(m.conversation_id);

    const { data: existingParts } = await admin
      .from("conversation_participants")
      .select("conversation_id").eq("user_id", user.id);
    const existing = new Set((existingParts ?? []).map((p) => p.conversation_id));

    let restored = 0;
    for (const convId of convosToEnsure) {
      // ensure conversation row + participant row
      await admin.from("conversations").upsert({ id: convId }, { onConflict: "id" });
      if (!existing.has(convId)) {
        await admin.from("conversation_participants").insert({
          conversation_id: convId, user_id: user.id,
        });
      }
    }

    // Insert messages that don't exist yet (only ones the user originally sent — others may
    // not be re-creatable due to RLS; we still insert all using service role for fidelity)
    const ids = messages.map((m) => m.id);
    let existingMsgIds = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500);
      const { data } = await admin.from("messages").select("id").in("id", slice);
      (data ?? []).forEach((r) => existingMsgIds.add(r.id));
    }
    const toInsert = messages.filter((m) => !existingMsgIds.has(m.id));
    for (let i = 0; i < toInsert.length; i += 500) {
      const slice = toInsert.slice(i, i + 500);
      const { error } = await admin.from("messages").insert(slice);
      if (!error) restored += slice.length;
    }

    return json({ ok: true, restored, total: messages.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
