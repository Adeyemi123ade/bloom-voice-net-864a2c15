import { useState } from "react";
import { Phone, Delete, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const navigate = useNavigate();

  const press = (k: string) => setValue((v) => v + k);
  const longZero = () => setValue((v) => v + "+");
  const back = () => setValue((v) => v.slice(0, -1));
  const clear = () => setValue("");

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

  const display = value ? formatDisplay(value) || value : "Enter number";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] p-0 gap-0 bg-background">
        <DialogHeader className="px-4 pt-3 pb-1">
          <DialogTitle className="text-xs font-semibold">Dialer</DialogTitle>
        </DialogHeader>
        <div className="px-4 pt-2 pb-3 flex items-center gap-2">
          <div
            className={`flex-1 text-center text-2xl font-light tracking-wide truncate ${
              value ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {display}
          </div>
          {value && (
            <button
              aria-label="Clear"
              onClick={clear}
              className="w-7 h-7 rounded-full hover:bg-secondary flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="px-6 pb-2 grid grid-cols-3 gap-y-3 gap-x-4">
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
              className="aspect-square rounded-full bg-secondary hover:bg-secondary/80 active:bg-primary/20 flex flex-col items-center justify-center transition-colors"
            >
              <span className="text-xl font-semibold text-foreground leading-none">
                {k.d}
              </span>
              {k.sub && (
                <span className="text-[9px] text-muted-foreground tracking-wider mt-0.5">
                  {k.sub}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="px-6 py-3 flex items-center justify-between">
          <div className="w-12" />
          <Button
            onClick={call}
            disabled={!value}
            className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground p-0 shadow-lg disabled:opacity-40"
            aria-label="Call"
          >
            <Phone className="w-6 h-6" />
          </Button>
          <button
            aria-label="Delete"
            onClick={back}
            disabled={!value}
            className="w-12 h-12 rounded-full hover:bg-secondary flex items-center justify-center disabled:opacity-30"
          >
            <Delete className="w-5 h-5 text-foreground" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
