import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UserPlus, UserCog, ChevronLeft, Check, Search } from "lucide-react";
import {
  addManualContact,
  addPhoneToManualContact,
  loadCachedContacts,
  loadManualContacts,
  type DeviceContact,
} from "@/lib/deviceContacts";
import { saveDeviceContact } from "@/lib/saveDeviceContact";
import { formatDisplay } from "@/lib/phone";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phoneE164: string;
  onSaved?: () => void;
}

type Mode = "choose" | "create" | "existing";

export default function AddNumberDialog({
  open,
  onOpenChange,
  phoneE164,
  onSaved,
}: Props) {
  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const allContacts = useMemo<DeviceContact[]>(() => {
    if (!open) return [];
    const merged = [
      ...(loadCachedContacts() ?? []),
      ...loadManualContacts(),
    ];
    // de-dupe by name+first phone
    const seen = new Set<string>();
    return merged.filter((c) => {
      const k = `${c.name}|${c.phones[0] ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allContacts;
    return allContacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [allContacts, search]);

  const reset = () => {
    setMode("choose");
    setName("");
    setSearch("");
    setBusy(false);
  };

  const close = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const createNew = async () => {
    const trimmed = name.trim() || phoneE164;
    setBusy(true);
    addManualContact(trimmed, phoneE164);
    const onDevice = await saveDeviceContact(trimmed, phoneE164);
    setBusy(false);
    toast({
      title: "Contact saved",
      description: onDevice
        ? "Added to your device contacts."
        : "Saved to your ChiChat contacts.",
    });
    onSaved?.();
    close(false);
  };

  const addToExisting = async (contact: DeviceContact) => {
    setBusy(true);
    addPhoneToManualContact(contact.name, phoneE164);
    // Best-effort: also add to device contacts as a new entry under same name
    const onDevice = await saveDeviceContact(contact.name, phoneE164);
    setBusy(false);
    toast({
      title: "Number added",
      description: onDevice
        ? `Added to ${contact.name} on your device.`
        : `Added to ${contact.name}.`,
    });
    onSaved?.();
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[340px] p-0 gap-0 bg-background">
        <DialogHeader className="px-4 pt-4 pb-2 flex-row items-center gap-2 space-y-0">
          {mode !== "choose" && (
            <button
              onClick={() => setMode("choose")}
              className="w-7 h-7 rounded-full hover:bg-secondary flex items-center justify-center -ml-1"
              aria-label="Back"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-sm">
              {mode === "choose" && "Add to contacts"}
              {mode === "create" && "Create new contact"}
              {mode === "existing" && "Add to existing contact"}
            </DialogTitle>
            <DialogDescription className="text-[11px] truncate">
              {formatDisplay(phoneE164) || phoneE164}
            </DialogDescription>
          </div>
        </DialogHeader>

        {mode === "choose" && (
          <div className="px-3 pb-4 pt-1 space-y-1">
            <button
              onClick={() => setMode("create")}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left"
            >
              <span className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                <UserPlus className="w-4 h-4" />
              </span>
              <span className="flex-1">
                <span className="block text-xs font-semibold">
                  Create new contact
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  Save as a brand new contact
                </span>
              </span>
            </button>
            <button
              onClick={() => setMode("existing")}
              disabled={allContacts.length === 0}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left disabled:opacity-40"
            >
              <span className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                <UserCog className="w-4 h-4" />
              </span>
              <span className="flex-1">
                <span className="block text-xs font-semibold">
                  Add to existing contact
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {allContacts.length === 0
                    ? "No contacts yet"
                    : "Attach to someone you already know"}
                </span>
              </span>
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="px-4 pb-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-contact-name" className="text-[11px]">
                Name
              </Label>
              <Input
                id="add-contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contact name"
                autoFocus
                className="h-9 text-xs"
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                onClick={() => setMode("choose")}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={createNew}
                disabled={busy}
                className="h-9 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}

        {mode === "existing" && (
          <div className="px-3 pb-3 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts"
                className="h-9 pl-8 text-xs"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto -mx-1">
              {filtered.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-6">
                  No matching contacts
                </p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={`${c.name}-${c.phones[0]}`}
                    onClick={() => addToExisting(c)}
                    disabled={busy}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary text-left disabled:opacity-40"
                  >
                    <span className="w-8 h-8 rounded-full bg-secondary text-foreground text-[11px] font-semibold flex items-center justify-center shrink-0">
                      {c.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-medium truncate">
                        {c.name}
                      </span>
                      <span className="block text-[10px] text-muted-foreground truncate">
                        {c.phones[0] ? formatDisplay(c.phones[0]) : ""}
                      </span>
                    </span>
                    <Check className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
