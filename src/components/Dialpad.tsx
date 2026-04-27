import { useRef, useState } from "react";
import { Phone, Delete, X, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toE164, formatDisplay } from "@/lib/phone";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Optional initial value (e.g. when re-dialing). */
  initial?: string;
}

const KEYS: { d: string; sub?: string }[] = [
  { d: "1" }, { d: "2", sub: "ABC" }, { d: "3", sub: "DEF" },
  { d: "4", sub: "GHI" }, { d: "5", sub: "JKL" }, { d: "6", sub: "MNO" },
  { d: "7", sub: "PQRS" }, { d: "8", sub: "TUV" }, { d: "9", sub: "WXYZ" },
  { d: "*" }, { d: "0", sub: "+" }, { d: "#" },
];

export default function Dialpad({ open, onOpenChange, initial = "" }: Props) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  /** Insert a string at the current cursor position (or append). */
  const insertAtCursor = (chunk: string) => {
    const el = inputRef.current;
    if (!el) {
      setValue((v) => v + chunk);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + chunk + value.slice(end);
    setValue(next);
    // Restore caret right after the inserted chunk
    requestAnimationFrame(() => {
      const pos = start + chunk.length;
      el.focus();
      try {
        el.setSelectionRange(pos, pos);
      } catch { /* ignore */ }
    });
  };

  /** Delete one char before caret, or selection if any. */
  const backspace = () => {
    const el = inputRef.current;
    if (!el) {
      setValue((v) => v.slice(0, -1));
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    if (start !== end) {
      const next = value.slice(0, start) + value.slice(end);
      setValue(next);
      requestAnimationFrame(() => {
        el.focus();
        try { el.setSelectionRange(start, start); } catch { /* ignore */ }
      });
      return;
    }
    if (start === 0) return;
    const next = value.slice(0, start - 1) + value.slice(start);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      try { el.setSelectionRange(start - 1, start - 1); } catch { /* ignore */ }
    });
  };

  const press = (k: string) => insertAtCursor(k);
  const longZero = () => {
    // Replace the just-inserted "0" with "+" if caret follows a 0, else insert "+"
    const el = inputRef.current;
    const caret = el?.selectionStart ?? value.length;
    if (caret > 0 && value[caret - 1] === "0") {
      const next = value.slice(0, caret - 1) + "+" + value.slice(caret);
      setValue(next);
      requestAnimationFrame(() => {
        el?.focus();
        try { el?.setSelectionRange(caret, caret); } catch { /* ignore */ }
      });
    } else {
      insertAtCursor("+");
    }
  };

  const clear = () => {
    setValue("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleaned = text.replace(/[^\d+*#]/g, "");
      if (!cleaned) {
        toast({ title: "Clipboard empty", description: "No phone number found." });
        return;
      }
      insertAtCursor(cleaned);
    } catch {
      toast({
        title: "Paste blocked",
        description: "Allow clipboard access or long-press the field to paste.",
        variant: "destructive",
      });
    }
  };

  const call = () => {
    const e164 = toE164(value.trim());
    if (!e164) {
      toast({
        title: "Invalid number",
        description: "Use international format like +234 801 234 5678.",
        variant: "destructive",
      });
      return;
    }
    onOpenChange(false);
    navigate(`/dial/${encodeURIComponent(e164)}`);
  };

  const preview = value ? formatDisplay(value) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] p-0 gap-0 bg-background">
        <DialogHeader className="px-4 pt-3 pb-1">
          <DialogTitle className="text-xs font-semibold">Dialer</DialogTitle>
        </DialogHeader>

        {/* Editable phone input */}
        <div className="px-4 pt-2 pb-1 flex items-center gap-2">
          <Input
            ref={inputRef}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={value}
            onChange={(e) => {
              // Allow only digits and + * #
              const cleaned = e.target.value.replace(/[^\d+*#]/g, "");
              setValue(cleaned);
            }}
            placeholder="Enter number"
            className="flex-1 h-12 text-2xl font-light tracking-wide text-center bg-transparent border-0 border-b border-border rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
          />
          {value && (
            <button
              aria-label="Clear"
              onClick={clear}
              className="w-7 h-7 rounded-full hover:bg-secondary flex items-center justify-center shrink-0"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Live formatted preview */}
        <div className="px-4 pb-2 h-4 text-[10px] text-muted-foreground text-center truncate">
          {preview && preview !== value ? preview : "\u00A0"}
        </div>

        <div className="px-5 pb-1 grid grid-cols-3 gap-x-3 gap-y-1.5">
          {KEYS.map((k) => (
            <button
              key={k.d}
              onClick={() => press(k.d)}
              onContextMenu={(e) => {
                if (k.d === "0") {
                  e.preventDefault();
                  longZero();
                }
              }}
              className="h-11 rounded-full bg-secondary hover:bg-secondary/80 active:bg-primary/20 flex flex-col items-center justify-center transition-colors"
            >
              <span className="text-lg font-semibold text-foreground leading-none">
                {k.d}
              </span>
              {k.sub && (
                <span className="text-[8px] text-muted-foreground tracking-wider leading-none mt-0.5">
                  {k.sub}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="px-5 py-2 flex items-center justify-between">
          <button
            aria-label="Paste"
            onClick={paste}
            className="w-10 h-10 rounded-full hover:bg-secondary flex items-center justify-center"
          >
            <ClipboardPaste className="w-4 h-4 text-foreground" />
          </button>
          <Button
            onClick={call}
            disabled={!value}
            className="w-12 h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground p-0 shadow-lg disabled:opacity-40"
            aria-label="Call"
          >
            <Phone className="w-5 h-5" />
          </Button>
          <button
            aria-label="Delete"
            onClick={backspace}
            disabled={!value}
            className="w-10 h-10 rounded-full hover:bg-secondary flex items-center justify-center disabled:opacity-30"
          >
            <Delete className="w-4 h-4 text-foreground" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
