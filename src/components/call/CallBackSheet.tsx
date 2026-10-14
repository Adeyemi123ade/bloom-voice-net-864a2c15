import { Phone, Video } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  type: "voice" | "video";
  onConfirm: () => void;
};

/**
 * Confirmation before calling back from a call record in the chat. A call
 * only starts on "Yes, call"; "No, cancel", tapping outside or Back just
 * closes the dialog.
 */
export default function CallBackSheet({ open, onOpenChange, name, type, onConfirm }: Props) {
  const Icon = type === "video" ? Video : Phone;
  const kind = type === "video" ? "video call" : "voice call";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[320px] rounded-2xl bg-background border-border">
        <AlertDialogHeader>
          <div className="mx-auto mb-1 w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <AlertDialogTitle className="text-center text-[17px]">Call {name}?</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Do you want to make a {kind} to {name}?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-col-reverse sm:space-x-0">
          <AlertDialogCancel className="mt-0 w-full">No, cancel</AlertDialogCancel>
          <AlertDialogAction
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Yes, call
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
