// Chat backup files: signed by the server so a restore can tell a real backup
// from a file someone edited.
//
// Backup files live in backup-media/<user id>/manifest.json. Older storage
// rules let the user overwrite that file, and chat-restore used to trust it.
// Now chat-backup writes { v: 2, signature, payload } where payload is the
// manifest as a JSON string and signature is an HMAC of that exact string.
// chat-restore only treats a file as a real backup when the signature checks.
//
// The key is BACKUP_SIGNING_SECRET when set, otherwise the service role key
// (always present in edge functions, never sent to the app).

export const MANIFEST_VERSION = 2;

/** The one place a user's backup file may live. Never read a path from the database or the client. */
export function manifestPathFor(userId: string): string {
  return `${userId}/manifest.json`;
}

function signingSecret(): string {
  // Read through globalThis so the unit tests (Node) can import this file too.
  const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
  const secret = env?.get("BACKUP_SIGNING_SECRET") || env?.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("No backup signing key");
  return secret;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): ArrayBuffer | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const buf = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buf);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return buf;
}

/** Wrap a manifest object into the signed file text. */
export async function signManifest(manifest: unknown, secret = signingSecret()): Promise<string> {
  const payload = JSON.stringify(manifest);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return JSON.stringify({ v: MANIFEST_VERSION, signature: toHex(sig), payload });
}

export type ReadManifest =
  | { signed: true; manifest: Record<string, unknown> }
  | { signed: false; manifest: Record<string, unknown> }
  | { signed: false; manifest: null };

/**
 * Parse a backup file. signed is true only when the signature matches.
 * Older (unsigned) backups and edited files come back with signed false, so
 * the caller applies its strictest rules to them.
 */
export async function readManifest(text: string, secret = signingSecret()): Promise<ReadManifest> {
  let outer: unknown;
  try {
    outer = JSON.parse(text);
  } catch {
    return { signed: false, manifest: null };
  }
  if (!outer || typeof outer !== "object") return { signed: false, manifest: null };
  const o = outer as Record<string, unknown>;

  if (o.v === MANIFEST_VERSION && typeof o.payload === "string" && typeof o.signature === "string") {
    let inner: unknown;
    try {
      inner = JSON.parse(o.payload);
    } catch {
      return { signed: false, manifest: null };
    }
    if (!inner || typeof inner !== "object") return { signed: false, manifest: null };
    const sig = fromHex(o.signature);
    const key = await hmacKey(secret);
    const ok = sig
      ? await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(o.payload))
      : false;
    return ok
      ? { signed: true, manifest: inner as Record<string, unknown> }
      : { signed: false, manifest: inner as Record<string, unknown> };
  }

  // Old format: the manifest object itself, unsigned.
  return { signed: false, manifest: o };
}

export interface RestoreMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  read_at: string | null;
  delivered_at: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CONTENT = 20_000;

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Pick the messages a restore may put back. Rules:
 * - only chats the user is in right now (restore never adds anyone to a chat);
 * - the sender must be a current member of that chat;
 * - from an unsigned or edited file, only the user's own messages;
 * - messages deleted for everyone are never brought back;
 * - only known columns, with checked types; no dates in the future.
 */
export function pickRestorableMessages(
  rawMessages: unknown,
  opts: {
    userId: string;
    signed: boolean;
    /** conversation id -> ids of its current members (only chats the user is in) */
    membersByChat: Map<string, Set<string>>;
    now?: number;
  },
): RestoreMessage[] {
  if (!Array.isArray(rawMessages)) return [];
  const now = opts.now ?? Date.now();
  const seen = new Set<string>();
  const out: RestoreMessage[] = [];
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    const id = m.id, conv = m.conversation_id, sender = m.sender_id, content = m.content;
    if (typeof id !== "string" || !UUID.test(id) || seen.has(id)) continue;
    if (typeof conv !== "string" || typeof sender !== "string" || typeof content !== "string") continue;
    if (m.deleted_for_everyone === true || content.length === 0 || content.length > MAX_CONTENT) continue;
    const members = opts.membersByChat.get(conv);
    if (!members || !members.has(opts.userId)) continue;
    if (!members.has(sender)) continue;
    if (!opts.signed && sender !== opts.userId) continue;
    const created = isoOrNull(m.created_at);
    if (!created || Date.parse(created) > now + 5 * 60_000) continue;
    seen.add(id);
    out.push({
      id,
      conversation_id: conv,
      sender_id: sender,
      content,
      created_at: created,
      edited_at: isoOrNull(m.edited_at),
      read_at: isoOrNull(m.read_at),
      delivered_at: isoOrNull(m.delivered_at),
    });
  }
  return out;
}
