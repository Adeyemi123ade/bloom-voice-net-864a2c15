import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { allCountries, type CountryEntry } from "@/lib/countries";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Props {
  value: CountryEntry["code"] | null;
  onChange: (c: CountryEntry) => void;
}

export default function CountryPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = allCountries();
  const current = useMemo(() => list.find((c) => c.code === value) ?? null, [list, value]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(t) ||
        c.code.toLowerCase().includes(t) ||
        c.dial.includes(t.replace("+", "")),
    );
  }, [list, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-12 px-3 rounded-xl bg-secondary/40 border border-border/40 text-sm flex items-center gap-1.5 hover:bg-secondary/60 transition-colors shrink-0"
        >
          <span className="text-base leading-none">{current?.flag ?? "🌐"}</span>
          <span className="font-medium">+{current?.dial ?? "—"}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[260px] p-0 bg-popover border-border"
      >
        <div className="p-2 border-b border-border/40">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search country or +code"
              className="w-full h-9 pl-8 pr-2 rounded-md bg-secondary/40 text-xs focus:outline-none border border-border/30"
            />
          </div>
        </div>
        <div className="max-h-[260px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">No matches</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.code}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                  setQ("");
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary text-left text-xs"
              >
                <span className="text-base leading-none">{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-muted-foreground">+{c.dial}</span>
                {c.code === value && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
