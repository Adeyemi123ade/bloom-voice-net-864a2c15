import { Phone, Video } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  type: "voice" | "video";
  onConfirm: () => void;
};

export default function CallBackSheet({ open, onOpenChange, name, type, onConfirm }: Props) {
  const Icon = type === "video" ? Video : Phone;
  const label = type === "video" ? "Video call" : "Call";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl px-0 pb-6 pt-3 max-w-md mx-auto bg-background border-border"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/30 mb-4" />
        <div className="px-6">
          <h3 className="text-center text-[17px] font-semibold text-foreground mb-5">
            {name}
          </h3>
          <button
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            className="w-full h-12 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
