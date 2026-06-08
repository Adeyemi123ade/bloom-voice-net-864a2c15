import { Download, Eye, FileText, FileSpreadsheet, Presentation, FileArchive, FileCode, FileAudio, FileVideo, File as FileIcon, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { getSignedChatMediaUrl, useSignedMediaUrl } from "@/lib/signedMedia";


export const FILE_PREFIX = "[file]";
// Encoded as: [file]url|mime|name|size|caption

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

function formatTimestamp(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function AttachmentBubble({
  meta,
  mine,
  timestamp,
  onDelete,
}: {
  meta: FileMeta;
  mine: boolean;
  timestamp?: string;
  onDelete?: () => void;
}) {
  const [imgOpen, setImgOpen] = useState(false);
  const isImage = meta.mime.startsWith("image/") && meta.mime !== "image/svg+xml";
  const isVideo = meta.mime.startsWith("video/");
  const isAudio = meta.mime.startsWith("audio/");
  const timeText = formatTimestamp(timestamp);
  const mediaUrl = useSignedMediaUrl(meta.url);


  if (isImage) {
    return (
      <>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setImgOpen(true);
          }}
          className="block rounded-2xl overflow-hidden relative"
        >
          <img
            src={meta.url}
            alt={meta.name}
            loading="lazy"
            className="w-[180px] h-[180px] object-cover block"
          />
          {meta.size > 0 && (
            <span className="absolute top-1.5 right-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/55 text-white">
              {fmtSize(meta.size)}
            </span>
          )}
          {timeText && (
            <span className="absolute bottom-1.5 right-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/55 text-white">
              {timeText}
            </span>
          )}
        </button>
        {meta.caption && (
          <p className="text-[13px] whitespace-pre-wrap break-words mt-1">{meta.caption}</p>
        )}
        {imgOpen && (
          <ImageViewer
            url={meta.url}
            name={meta.name}
            onClose={() => setImgOpen(false)}
            onDelete={onDelete}
          />
        )}
      </>
    );
  }

  if (isVideo) {
    return (
      <>
        <div className="relative w-[200px]">
          <video
            src={meta.url}
            controls
            playsInline
            className="w-full max-h-[260px] rounded-2xl bg-black block"
          />
          {meta.size > 0 && (
            <span className="absolute top-1.5 right-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/55 text-white pointer-events-none">
              {fmtSize(meta.size)}
            </span>
          )}
          {timeText && (
            <span className="absolute bottom-1.5 right-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/55 text-white pointer-events-none">
              {timeText}
            </span>
          )}
        </div>
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
        {timeText && (
          <span className={`text-[10px] self-end ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {timeText}
          </span>
        )}
      </div>
    );
  }

  const style = docStyle(meta.mime, meta.name);
  const Icon = style.Icon;
  return (
    <div className="flex flex-col gap-1">
      <a
        href={meta.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 min-w-[210px]"
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${style.bg}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium truncate">{meta.name}</p>
          <p className={`text-2xs ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {style.label}
            {meta.size ? ` · ${fmtSize(meta.size)}` : ""}
          </p>
        </div>
        <Download className={`w-4 h-4 flex-shrink-0 ${mine ? "text-primary-foreground/80" : "text-muted-foreground"}`} />
      </a>
      {meta.caption && (
        <p className="text-[13px] whitespace-pre-wrap break-words">{meta.caption}</p>
      )}
      {timeText && (
        <span className={`text-[10px] self-end ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {timeText}
        </span>
      )}
    </div>
  );
}

/**
 * Full-screen image viewer:
 * - Off-white background regardless of theme.
 * - Pinch / pan / double-tap zoom.
 * - Single tap on the image → toggles a delete-action overlay (highlight + trash).
 * - Long-press on the image → opens a small menu with Preview / Download.
 * - Device Back button (or popstate) closes.
 */
function ImageViewer({
  url,
  name,
  onClose,
  onDelete,
}: {
  url: string;
  name: string;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [showDelete, setShowDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  useEffect(() => {
    window.history.pushState({ chichatImageViewer: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPop);
      document.body.style.overflow = prevOverflow;
      if (window.history.state?.chichatImageViewer) window.history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerDownload = async () => {
    setMenuOpen(false);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = name || "image";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch {
      // Fallback: open in new tab
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const startLongPress = () => {
    longPressed.current = false;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setMenuOpen(true);
      try {
        (navigator as { vibrate?: (p: number | number[]) => boolean }).vibrate?.(20);
      } catch { /* ignore */ }
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onImageTap = () => {
    if (longPressed.current) return;
    setShowDelete((s) => !s);
  };

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex: 2147483647, backgroundColor: "#F5F2EC" }}
    >
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={8}
        doubleClick={{ mode: "toggle", step: 2 }}
        wheel={{ step: 0.2 }}
        pinch={{ step: 5 }}
      >
        <TransformComponent
          wrapperStyle={{ width: "100vw", height: "100vh" }}
          contentStyle={{ width: "100vw", height: "100vh" }}
        >
          <img
            src={url}
            alt={name}
            className={`w-screen h-screen object-contain select-none transition-shadow ${
              showDelete ? "ring-4 ring-primary/60 rounded-sm" : ""
            }`}
            draggable={false}
            onClick={onImageTap}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            onTouchMove={cancelLongPress}
            onMouseDown={startLongPress}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuOpen(true);
            }}
          />
        </TransformComponent>
      </TransformWrapper>

      {/* Delete-action overlay (single-tap toggle) */}
      {showDelete && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDelete(false);
            onDelete();
            onClose();
          }}
          aria-label="Delete image"
          className="absolute top-6 right-6 w-12 h-12 rounded-full bg-destructive/90 hover:bg-destructive flex items-center justify-center shadow-lg"
        >
          <Trash2 className="w-5 h-5 text-destructive-foreground" />
        </button>
      )}

      {/* Long-press action sheet */}
      {menuOpen && (
        <>
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-8 w-[260px] rounded-xl bg-background border border-border shadow-xl overflow-hidden">
            <button
              onClick={() => setMenuOpen(false)}
              className="w-full h-11 text-sm text-foreground hover:bg-secondary border-b border-border flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Preview (pinch to zoom)
            </button>
            <button
              onClick={triggerDownload}
              className="w-full h-11 text-sm text-foreground hover:bg-secondary flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download to phone
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
