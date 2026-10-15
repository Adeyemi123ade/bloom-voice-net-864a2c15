// In-app copy and paste for chat messages of every type.
//
// Copying a voice note, photo, video or document used to put a raw storage
// URL on the clipboard, so pasting it sent that URL as a plain text message.
// Now a copy also remembers the original message content (an internal
// reference to the same stored file, the same thing Forward sends), and the
// composer turns a matching paste back into a real voice note / photo /
// video / document message. Nothing is uploaded again.
//
// The system clipboard still gets something sensible for other apps: the
// text itself for text messages, a short label for media, and for photos the
// image itself where the browser allows it.
import { getSignedChatMediaUrl } from "@/lib/signedMedia";
import { parseFileMessage } from "@/components/chat/AttachmentBubble";
import { VOICE_PREFIX } from "@/lib/chat/format";
import { messageKind, stripQuotedReply, type MessageKind } from "@/lib/chat/messageKinds";

export type ChatClip = {
  /** The stored message content to send again ("[voice]…", "[file]…" or plain text). */
  content: string;
  kind: MessageKind;
  /** Exactly what went on the system clipboard as text/plain; a paste must match it. */
  text: string;
  copiedAt: number;
};

const KEY = "chichat:clipboard";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let memoryClip: ChatClip | null = null;

function save(clip: ChatClip) {
  memoryClip = clip;
  try {
    localStorage.setItem(KEY, JSON.stringify(clip));
  } catch {
    // Storage unavailable: the in-memory copy still works for this session.
  }
}

export function loadClip(): ChatClip | null {
  let clip = memoryClip;
  if (!clip) {
    try {
      const raw = localStorage.getItem(KEY);
      clip = raw ? (JSON.parse(raw) as ChatClip) : null;
    } catch {
      clip = null;
    }
  }
  if (!clip || typeof clip.content !== "string" || Date.now() - clip.copiedAt > MAX_AGE_MS) return null;
  return clip;
}

const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();

/**
 * If pasted text is what our last in-app copy put on the clipboard, return
 * that copy, so the composer can recreate the original message instead of
 * pasting a label. Text copies return null: pasting text works as normal.
 */
export function matchPastedClip(pastedText: string): ChatClip | null {
  const clip = loadClip();
  if (!clip || clip.kind === "text") return null;
  return norm(pastedText) === norm(clip.text) ? clip : null;
}

/** Label put on the clipboard for a media message. */
export function clipLabel(content: string): string {
  const kind = messageKind(content);
  const meta = parseFileMessage(content);
  if (kind === "voice") return "🎤 Voice note (ChiChat)";
  if (kind === "image") return `📷 Photo: ${meta?.name ?? "image"} (ChiChat)`;
  if (kind === "video") return `🎥 Video: ${meta?.name ?? "video"} (ChiChat)`;
  return `📄 ${meta?.name ?? "Document"} (ChiChat)`;
}

/** URL inside a voice or file message, or null. */
export function mediaUrlOf(content: string): string | null {
  if (content.startsWith(VOICE_PREFIX)) return content.slice(VOICE_PREFIX.length) || null;
  return parseFileMessage(content)?.url || null;
}

async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext("2d")?.drawImage(bmp, 0, 0);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG conversion failed"))), "image/png"),
  );
}

export type CopyResult = { ok: boolean; label?: string; reason?: string };

/**
 * Copy one or more messages. Several messages are only copied together when
 * they're all text (joined, oldest first). Must be called straight from the
 * tap handler: browsers only allow clipboard writes during the tap.
 */
export async function copyMessages(contents: string[]): Promise<CopyResult> {
  if (contents.length === 0) return { ok: false, reason: "Nothing to copy." };
  if (contents.length > 1) {
    if (!contents.every((c) => messageKind(c) === "text"))
      return { ok: false, reason: "Copy one photo, video, voice note or file at a time." };
    const text = contents.map((c) => stripQuotedReply(c)).join("\n\n");
    await navigator.clipboard.writeText(text);
    save({ content: text, kind: "text", text, copiedAt: Date.now() });
    return { ok: true, label: "Copied" };
  }

  const content = contents[0];
  const kind = messageKind(content);
  if (kind === "call") return { ok: false, reason: "Call records can't be copied." };
  if (kind === "text") {
    const text = stripQuotedReply(content);
    await navigator.clipboard.writeText(text);
    save({ content: text, kind, text, copiedAt: Date.now() });
    return { ok: true, label: "Copied" };
  }

  const url = mediaUrlOf(content);
  if (!url || url.startsWith("blob:")) return { ok: false, reason: "This is still sending. Try again in a moment." };

  const text = clipLabel(content);
  // Remember the reference before touching the clipboard, so the in-app
  // paste works even if the browser refuses the image part below.
  save({ content, kind, text, copiedAt: Date.now() });

  if (kind === "image" && "ClipboardItem" in window) {
    try {
      // Hand write() a pending Blob so it runs inside the tap's activation
      // window (see the history of this in ChatRoom copy); browsers only
      // accept PNG images on the clipboard, so convert on the way.
      const png = getSignedChatMediaUrl(url)
        .then((u) => fetch(u))
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.blob();
        })
        .then(toPng);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "image/png": png as unknown as Promise<Blob>,
        }),
      ]);
      return { ok: true, label: "Photo copied" };
    } catch {
      // Fall through to the label only. In-app paste still works.
    }
  }
  await navigator.clipboard.writeText(text);
  const what = kind === "voice" ? "Voice note" : kind === "image" ? "Photo" : kind === "video" ? "Video" : "File";
  return { ok: true, label: `${what} copied` };
}

/**
 * Check a pasted media message's file still exists and can be fetched
 * before it's sent, so a paste never produces a broken bubble.
 */
export async function checkClipAvailable(content: string): Promise<{ ok: boolean; reason?: string }> {
  const url = mediaUrlOf(content);
  if (!url || url.startsWith("blob:")) return { ok: false, reason: "That copied item is no longer available." };
  try {
    const signed = await getSignedChatMediaUrl(url);
    const res = await fetch(signed, { method: "HEAD" });
    if (res.ok) return { ok: true };
    if (res.status === 404 || res.status === 400)
      return { ok: false, reason: "The original file was removed, so it can't be pasted." };
    return { ok: false, reason: "Couldn't reach the copied file. Check your connection and try again." };
  } catch {
    return { ok: false, reason: "Couldn't reach the copied file. Check your connection and try again." };
  }
}
