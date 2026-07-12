import { useState } from "react";
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
import { addManualContact } from "@/lib/deviceContacts";
import { saveDeviceContact } from "@/lib/saveDeviceContact";
import { formatDisplay } from "@/lib/phone";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phoneE164: string;
  onSaved?: () => void;
}

export default function SaveContactDialog({
  open,
  onOpenChange,
  phoneE164,
  onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
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
    setName("");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[320px]">
        <DialogHeader>
          <DialogTitle className="text-base">Save contact</DialogTitle>
          <DialogDescription className="text-base">
            {formatDisplay(phoneE164) || phoneE164}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="contact-name" className="text-base">Name</Label>
          <Input
            id="contact-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contact name"
            autoFocus
            className="h-11 text-base"
          />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-11 text-base"
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy}
            className="h-11 text-base bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
