import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronRight,
  LogOut,
  Smartphone,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Settings() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { theme, setTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [confirmStage, setConfirmStage] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = "Settings — Chichat";
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const deleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    await supabase
      .from("profiles")
      .upsert(
        { id: user.id, display_name: "Deleted user", avatar_url: null, is_online: false },
        { onConflict: "id" },
      );
    await supabase.auth.signOut();
    setDeleting(false);
    toast({ title: "Account removed", description: "You have been signed out." });
    navigate("/register");
  };

  const themeLabel =
    theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System default";

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-y-auto">
        {/* Header */}
        <div className="px-3 pt-4 pb-3 flex items-center gap-2 border-b border-border sticky top-0 bg-background z-10">
          <button
            aria-label="Back"
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <h1 className="text-sm font-semibold text-foreground">Settings</h1>
        </div>

        <div className="flex-1 px-3 py-4 flex flex-col">
          {/* Profile */}
          <button
            onClick={() => navigate("/profile")}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Profile setting</p>
              <p className="text-[11px] text-muted-foreground truncate">
                Edit name, photo and about
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Theme */}
          <button
            onClick={() => setThemeOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left"
          >
            <span className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <Palette className="w-4 h-4 text-primary" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Theme</p>
              <p className="text-[11px] text-muted-foreground">{themeLabel}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Sign out */}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary text-left mt-1"
          >
            <span className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <LogOut className="w-4 h-4 text-foreground" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Sign out</p>
              <p className="text-[11px] text-muted-foreground">End your current session</p>
            </div>
          </button>

          {/* Spacer pushes Delete account to the bottom */}
          <div className="flex-1" />

          {/* Delete account (far down) */}
          <div className="pt-6 pb-2">
            <AlertDialog onOpenChange={(o) => !o && setConfirmStage(false)}>
              <AlertDialogTrigger asChild>
                <button className="w-full h-10 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs flex items-center justify-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete account
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[280px]">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-sm">
                    {confirmStage ? "Are you absolutely sure?" : "Delete your account?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs">
                    {confirmStage
                      ? "This permanently removes your profile and signs you out. This cannot be undone."
                      : "Your profile and presence will be removed. You'll need to register again to come back."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="text-xs h-9">Cancel</AlertDialogCancel>
                  {confirmStage ? (
                    <AlertDialogAction
                      onClick={deleteAccount}
                      disabled={deleting}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs h-9"
                    >
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </AlertDialogAction>
                  ) : (
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        setConfirmStage(true);
                      }}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs h-9"
                    >
                      Continue
                    </AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Theme dialog */}
        <Dialog open={themeOpen} onOpenChange={setThemeOpen}>
          <DialogContent className="max-w-[300px] bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-sm">Choose theme</DialogTitle>
            </DialogHeader>
            <div className="space-y-1">
              {[
                { value: "system", label: "System default", Icon: Monitor },
                { value: "dark", label: "Dark", Icon: Moon },
                { value: "light", label: "Light", Icon: Sun },
              ].map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => {
                    setTheme(value);
                    setThemeOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left text-xs ${
                    theme === value
                      ? "bg-primary/15 text-foreground"
                      : "hover:bg-secondary text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="flex-1">{label}</span>
                  {theme === value && (
                    <span className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MobileFrame>
  );
}
