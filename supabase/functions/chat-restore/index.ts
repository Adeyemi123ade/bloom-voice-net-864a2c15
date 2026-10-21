// Restores missing messages from the user's own backup.
//
// Safety rules (see _shared/backupManifest.ts):
// - the backup is always read from backup-media/<user id>/manifest.json,
//   never from a path stored in the database;
// - restore never creates chats and never adds the user to a chat: it only
//   puts messages back into chats the user is in right now;
// - each message's sender must be a current member of that chat;
// - a file whose signature does not check (an older backup, or one that was
//   edited) can only restore the user's own messages;
// - messages that already exist are left untouched.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { manifestPathFor, pickRestorableMessages, readManifest } from "../_shared/backupManifest.ts";

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
    const userId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: backup } = await admin
      .from("chat_backups").select("user_id").eq("user_id", userId).maybeSingle();
    if (!backup) return json({ error: "No backup found" }, 404);

    const { data: file, error: dErr } = await admin.storage
      .from("backup-media").download(manifestPathFor(userId));
    if (dErr || !file) return json({ error: "No backup found" }, 404);

    const read = await readManifest(await file.text());
    if (!read.manifest) return json({ error: "Backup file can't be read" }, 422);
    // A signed backup must belong to this user.
    const signed = read.signed && read.manifest.user_id === userId;
    const rawMessages = read.manifest.messages;

    // Chats the user is in now, with their current members.
    const { data: myParts, error: pErr } = await admin
      .from("conversation_participants").select("conversation_id").eq("user_id", userId);
    if (pErr) return json({ error: "Restore failed" }, 500);
    const myChats = [...new Set((myParts ?? []).map((p: { conversation_id: string }) => p.conversation_id))];
    const membersByChat = new Map<string, Set<string>>();
    for (let i = 0; i < myChats.length; i += 200) {
      const slice = myChats.slice(i, i + 200);
      const { data: parts, error } = await admin
        .from("conversation_participants").select("conversation_id, user_id").in("conversation_id", slice);
      if (error) return json({ error: "Restore failed" }, 500);
      for (const p of (parts ?? []) as { conversation_id: string; user_id: string }[]) {
        const set = membersByChat.get(p.conversation_id) ?? new Set<string>();
        set.add(p.user_id);
        membersByChat.set(p.conversation_id, set);
      }
    }

    const candidates = pickRestorableMessages(rawMessages, { userId, signed, membersByChat });
    const total = Array.isArray(rawMessages) ? rawMessages.length : 0;

    // Only messages that don't exist yet.
    const existing = new Set<string>();
    const ids = candidates.map((m) => m.id);
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await admin.from("messages").select("id").in("id", ids.slice(i, i + 500));
      (data ?? []).forEach((r: { id: string }) => existing.add(r.id));
    }
    const toInsert = candidates.filter((m) => !existing.has(m.id));

    let restored = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const slice = toInsert.slice(i, i + 500);
      const { error } = await admin.from("messages").insert(slice);
      if (!error) restored += slice.length;
      else console.error("[chat-restore] insert failed", error.message);
    }

    return json({ ok: true, restored, total, skipped: total - restored, verified: signed });
  } catch (e) {
    console.error("[chat-restore]", e);
    return json({ error: "Restore failed" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
