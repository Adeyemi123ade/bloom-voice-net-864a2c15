import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LucideIcon } from "lucide-react";

export interface ContactAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  subtitle?: string;
  actions: ContactAction[];
}

export default function ContactActionSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  actions,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-6 max-w-[420px] mx-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">{title}</SheetTitle>
          {subtitle && (
            <p className="text-base text-muted-foreground">{subtitle}</p>
          )}
        </SheetHeader>
        <div className="mt-3 space-y-1">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                onClick={() => {
                  onOpenChange(false);
                  a.onClick();
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left ${
                  a.destructive ? "text-destructive" : "text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-base font-medium">{a.label}</span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
