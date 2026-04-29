// Snapshots the user's chats (messages + media references) into the backup-media bucket.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const token = auth.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const user = { id: claims.claims.sub as string };

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get conversations user belongs to
    const { data: parts } = await admin
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);
    const convIds = (parts ?? []).map((p) => p.conversation_id);

    let messages: unknown[] = [];
    if (convIds.length) {
      const { data: msgs } = await admin
        .from("messages")
        .select("*")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true });
      messages = msgs ?? [];
    }

    // Count media references in chat-media bucket under the user's folder
    let mediaCount = 0;
    let totalBytes = 0;
    try {
      const { data: files } = await admin.storage.from("chat-media").list(user.id, { limit: 1000 });
      mediaCount = files?.length ?? 0;
      totalBytes = (files ?? []).reduce(
        (n, f) => n + ((f.metadata as { size?: number } | null)?.size ?? 0),
        0,
      );
    } catch { /* ignore */ }

    const manifest = {
      user_id: user.id,
      created_at: new Date().toISOString(),
      message_count: messages.length,
      media_count: mediaCount,
      messages,
    };
    const manifestPath = `${user.id}/manifest.json`;
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
    const { error: upErr } = await admin.storage
      .from("backup-media")
      .upload(manifestPath, blob, { upsert: true, contentType: "application/json" });
    if (upErr) return json({ error: upErr.message }, 500);

    await admin.from("chat_backups").upsert({
      user_id: user.id,
      last_backup_at: new Date().toISOString(),
      message_count: messages.length,
      media_count: mediaCount,
      total_bytes: totalBytes,
      manifest_path: manifestPath,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return json({ ok: true, message_count: messages.length, media_count: mediaCount });
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
