import { FileText, Download, FileSpreadsheet, Presentation, FileArchive, FileCode, FileAudio, FileVideo, File as FileIcon } from "lucide-react";
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

/** Returns true when the bubble should render WITHOUT the surrounding chat bubble (image/video). */
export function isBareAttachment(meta: FileMeta): boolean {
  return meta.mime.startsWith("image/") || meta.mime.startsWith("video/");
}

type DocStyle = { Icon: typeof FileText; bg: string; label: string };

function docStyle(mime: string, name: string): DocStyle {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime === "application/pdf" || ext === "pdf")
    return { Icon: FileText, bg: "bg-red-600", label: "PDF" };
  if (
    mime.includes("spreadsheet") ||
    mime === "application/vnd.ms-excel" ||
    ["xls", "xlsx", "csv"].includes(ext)
  )
    return { Icon: FileSpreadsheet, bg: "bg-emerald-600", label: ext.toUpperCase() || "XLSX" };
  if (
    mime.includes("presentation") ||
    mime === "application/vnd.ms-powerpoint" ||
    ["ppt", "pptx"].includes(ext)
  )
    return { Icon: Presentation, bg: "bg-orange-600", label: ext.toUpperCase() || "PPTX" };
  if (
    mime.includes("word") ||
    mime === "application/msword" ||
    ["doc", "docx", "rtf"].includes(ext)
  )
    return { Icon: FileText, bg: "bg-blue-600", label: ext.toUpperCase() || "DOC" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext) || mime.includes("zip") || mime.includes("compressed"))
    return { Icon: FileArchive, bg: "bg-amber-600", label: ext.toUpperCase() || "ZIP" };
  if (
    ["js", "ts", "tsx", "jsx", "json", "xml", "html", "css", "py", "java", "c", "cpp", "go", "rs", "svg"].includes(ext) ||
    mime.includes("xml") ||
    mime === "image/svg+xml"
  )
    return { Icon: FileCode, bg: "bg-violet-600", label: ext.toUpperCase() || "CODE" };
  if (mime.startsWith("audio/")) return { Icon: FileAudio, bg: "bg-pink-600", label: ext.toUpperCase() || "AUDIO" };
  if (mime.startsWith("video/")) return { Icon: FileVideo, bg: "bg-indigo-600", label: ext.toUpperCase() || "VIDEO" };
  if (mime.startsWith("text/")) return { Icon: FileText, bg: "bg-slate-600", label: ext.toUpperCase() || "TXT" };
  return { Icon: FileIcon, bg: "bg-zinc-600", label: ext.toUpperCase() || "FILE" };
}

export function AttachmentBubble({
  meta,
  mine,
}: {
  meta: FileMeta;
  mine: boolean;
}) {
  const [imgOpen, setImgOpen] = useState(false);
  const isImage = meta.mime.startsWith("image/") && meta.mime !== "image/svg+xml";
  const isVideo = meta.mime.startsWith("video/");
  const isAudio = meta.mime.startsWith("audio/");

  if (isImage) {
    return (
      <>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setImgOpen(true);
          }}
          className="block rounded-2xl overflow-hidden"
        >
          <img
            src={meta.url}
            alt={meta.name}
            loading="lazy"
            className="w-[180px] h-[180px] object-cover block"
          />
        </button>
        {meta.caption && (
          <p className="text-[13px] whitespace-pre-wrap break-words mt-1">{meta.caption}</p>
        )}
        {imgOpen && (
          <div
            className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4"
            onClick={(e) => {
              e.stopPropagation();
              setImgOpen(false);
            }}
          >
            <img src={meta.url} alt={meta.name} className="max-w-full max-h-full object-contain" />
          </div>
        )}
      </>
    );
  }

  if (isVideo) {
    return (
      <>
        <video
          src={meta.url}
          controls
          playsInline
          className="w-[200px] max-h-[260px] rounded-2xl bg-black block"
        />
        {meta.caption && (
          <p className="text-[13px] whitespace-pre-wrap break-words mt-1">{meta.caption}</p>
        )}
      </>
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

  // Generic doc card with type-specific icon + color
  const style = docStyle(meta.mime, meta.name);
  const Icon = style.Icon;
  return (
    <div className="flex flex-col gap-1">
      <a
        href={meta.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl min-w-[210px] ${
          mine ? "bg-primary-foreground/15" : "bg-foreground/10"
        }`}
      >
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${style.bg}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium truncate">{meta.name}</p>
          <p
            className={`text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}
          >
            {style.label}
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
