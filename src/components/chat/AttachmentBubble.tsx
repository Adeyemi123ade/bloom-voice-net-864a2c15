import { FileText, Download, Play } from "lucide-react";
import { useState } from "react";

export const FILE_PREFIX = "[file]";
// Encoded as: [file]url|mime|name|size|caption
// caption may be empty; name is URL-encoded so it can safely contain spaces / pipes.

export type FileMeta = {
  url: string;
  mime: string;
  name: string;
  size: number;
  caption: string;
};

export function encodeFileMessage(m: FileMeta): string {
  return `${FILE_PREFIX}${m.url}|${m.mime}|${encodeURIComponent(m.name)}|${m.size}|${encodeURIComponent(
    m.caption,
  )}`;
}

export function parseFileMessage(content: string): FileMeta | null {
  if (!content.startsWith(FILE_PREFIX)) return null;
  const body = content.slice(FILE_PREFIX.length);
  // url may contain '|' technically, but Supabase storage URLs don't.
  const parts = body.split("|");
  if (parts.length < 4) return null;
  const [url, mime, nameEnc, sizeStr, captionEnc = ""] = parts;
  return {
    url,
    mime: mime || "application/octet-stream",
    name: safeDecode(nameEnc),
    size: Number(sizeStr) || 0,
    caption: safeDecode(captionEnc),
  };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function fmtSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentBubble({
  meta,
  mine,
}: {
  meta: FileMeta;
  mine: boolean;
}) {
  const [imgOpen, setImgOpen] = useState(false);
  const isImage = meta.mime.startsWith("image/");
  const isVideo = meta.mime.startsWith("video/");
  const isAudio = meta.mime.startsWith("audio/");
  const isPdf = meta.mime === "application/pdf";

  if (isImage) {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setImgOpen(true);
          }}
          className="block rounded-xl overflow-hidden bg-black/20"
        >
          <img
            src={meta.url}
            alt={meta.name}
            loading="lazy"
            className="max-w-[240px] max-h-[280px] object-cover"
          />
        </button>
        {meta.caption && (
          <p className="text-[13px] whitespace-pre-wrap break-words">{meta.caption}</p>
        )}
        {imgOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={(e) => {
              e.stopPropagation();
              setImgOpen(false);
            }}
          >
            <img src={meta.url} alt={meta.name} className="max-w-full max-h-full object-contain" />
          </div>
        )}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="flex flex-col gap-1">
        <video
          src={meta.url}
          controls
          playsInline
          className="max-w-[260px] max-h-[300px] rounded-xl bg-black"
        />
        {meta.caption && (
          <p className="text-[13px] whitespace-pre-wrap break-words">{meta.caption}</p>
        )}
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="flex flex-col gap-1 min-w-[200px]">
        <audio src={meta.url} controls className="w-full h-9" />
        {meta.caption && (
          <p className="text-[13px] whitespace-pre-wrap break-words">{meta.caption}</p>
        )}
      </div>
    );
  }

  // PDF / generic doc card
  const Icon = isPdf ? FileText : FileText;
  return (
    <div className="flex flex-col gap-1">
      <a
        href={meta.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl min-w-[200px] ${
          mine ? "bg-primary-foreground/15" : "bg-foreground/10"
        }`}
      >
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isPdf ? "bg-destructive/80 text-destructive-foreground" : "bg-primary text-primary-foreground"
          }`}
        >
          {isPdf ? <Icon className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium truncate">{meta.name}</p>
          <p
            className={`text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}
          >
            {(isPdf ? "PDF" : meta.mime.split("/")[1] || "file").toUpperCase()}
            {meta.size ? ` · ${fmtSize(meta.size)}` : ""}
          </p>
        </div>
        <Download
          className={`w-4 h-4 flex-shrink-0 ${
            mine ? "text-primary-foreground/80" : "text-muted-foreground"
          }`}
        />
      </a>
      {meta.caption && (
        <p className="text-[13px] whitespace-pre-wrap break-words">{meta.caption}</p>
      )}
    </div>
  );
}
