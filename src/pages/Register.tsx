import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import MobileFrame from "@/components/MobileFrame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: "Name must be at least 2 characters" })
    .max(60, { message: "Name must be less than 60 characters" }),
  email: z
    .string()
    .trim()
    .email({ message: "Enter a valid email address" })
    .max(255, { message: "Email must be less than 255 characters" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .max(72, { message: "Password must be less than 72 characters" })
    .regex(/[A-Z]/, { message: "Include at least one uppercase letter" })
    .regex(/[0-9]/, { message: "Include at least one number" }),
});

type FormErrors = Partial<Record<"name" | "email" | "password", string>>;

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<FormErrors & { confirmPassword?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = registerSchema.safeParse({ name, email, password });
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0] as keyof FormErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: result.data.email,
      password: result.data.password,
      options: {
        data: { full_name: result.data.name },
        emailRedirectTo: `${window.location.origin}/welcome`,
      },
    });
    setSubmitting(false);
    if (error) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Code sent", description: `We sent a 6-digit code to ${result.data.email}.` });
    navigate("/verify", { state: { email: result.data.email, name: result.data.name } });
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col px-6 pt-12 pb-8">
        <button
          onClick={() => navigate("/")}
          aria-label="Back"
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-secondary transition-colors -ml-2"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>

        <div className="mt-6">
          <h1 className="text-[22px] font-bold text-foreground leading-tight">
            Create your account
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Join Chichat and experience the possibilities.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 flex-1 flex flex-col">
          <div className="space-y-5">
            <div>
              <Label htmlFor="name" className="text-xs text-muted-foreground">
                Full name
              </Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                maxLength={60}
                className="mt-2 h-12 bg-input border-border text-foreground placeholder:text-muted-foreground"
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-xs text-destructive mt-1.5">{errors.name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="email" className="text-xs text-muted-foreground">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                maxLength={255}
                className="mt-2 h-12 bg-input border-border text-foreground placeholder:text-muted-foreground"
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="text-xs text-destructive mt-1.5">{errors.email}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password" className="text-xs text-muted-foreground">
                Password
              </Label>
              <div className="relative mt-2">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  maxLength={72}
                  className="h-12 bg-input border-border text-foreground placeholder:text-muted-foreground pr-12"
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password ? (
                <p className="text-xs text-destructive mt-1.5">{errors.password}</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1.5">
                  8+ characters, with an uppercase letter and a number.
                </p>
              )}
            </div>
          </div>

          <div className="mt-auto pt-8">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
            >
              {submitting ? "Sending code…" : "Continue"}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center mt-4">
              By continuing, you agree to our Terms & Privacy Policy.
            </p>
          </div>
        </form>
      </div>
    </MobileFrame>
  );
}
