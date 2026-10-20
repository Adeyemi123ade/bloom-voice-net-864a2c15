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
import { useLanguage } from "@/lib/i18n/context";
import { requestIgnoreBatteryOptimizations } from "@/lib/nativeCalls";

/**
 * Explains the phone's battery list before opening it: Google Play doesn't
 * let ChiChat ask for the exemption in one tap, so the person picks ChiChat
 * in the list themselves.
 */
export default function BatteryHelpDialog({
  open,
  onOpenChange,
  onOpened,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[340px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("bat.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("bat.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("bat.later")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false);
              void requestIgnoreBatteryOptimizations().then(() => onOpened?.());
            }}
          >
            {t("bat.open")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
