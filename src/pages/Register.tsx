import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
    const fieldErrors: FormErrors & { confirmPassword?: string } = {};
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const key = issue.path[0] as keyof FormErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      });
    }
    if (password !== confirmPassword) {
      fieldErrors.confirmPassword = "Passwords don't match";
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: result.data!.email,
      password: result.data!.password,
      options: {
        data: { full_name: result.data!.name },
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
    toast({ title: "Check your email", description: `We sent a 6-digit code to ${result.data!.email}.` });
    navigate("/verify", { state: { email: result.data!.email, name: result.data!.name } });
  };

  return (
    <MobileFrame>
      <div className="h-full w-full flex flex-col px-4 pt-5 pb-4 overflow-y-auto">
        <button
          onClick={() => navigate("/")}
          aria-label="Back"
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors -ml-1"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>

        <div className="mt-2">
          <h1 className="text-[18px] font-bold text-foreground leading-tight">
            Create your account
          </h1>
          <p className="text-[11px] text-muted-foreground mt-1">
            Join Chichat and experience the possibilities.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 flex-1 flex flex-col">
          <div className="space-y-2.5">
            <div>
              <Label htmlFor="name" className="text-[10px] text-muted-foreground">
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
                className="mt-1 h-9 text-xs bg-input border-border text-foreground placeholder:text-muted-foreground"
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-[10px] text-destructive mt-1">{errors.name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="email" className="text-[10px] text-muted-foreground">
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
                className="mt-1 h-9 text-xs bg-input border-border text-foreground placeholder:text-muted-foreground"
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="text-[10px] text-destructive mt-1">{errors.email}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password" className="text-[10px] text-muted-foreground">
                Password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  maxLength={72}
                  className="h-9 text-xs bg-input border-border text-foreground placeholder:text-muted-foreground pr-10"
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[10px] text-destructive mt-1">{errors.password}</p>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword" className="text-[10px] text-muted-foreground">
                Confirm password
              </Label>
              <Input
                id="confirmPassword"
                type={showPwd ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                maxLength={72}
                className="mt-1 h-9 text-xs bg-input border-border text-foreground placeholder:text-muted-foreground"
                aria-invalid={!!errors.confirmPassword}
              />
              {errors.confirmPassword && (
                <p className="text-[10px] text-destructive mt-1">{errors.confirmPassword}</p>
              )}
            </div>
          </div>

          <div className="mt-auto pt-3">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg"
            >
              {submitting ? "Sending code…" : "Continue"}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Already have an account?{" "}
              <Link to="/login" className="text-accent font-semibold hover:underline">
                Sign in
              </Link>
            </p>
            <p className="text-[9px] text-muted-foreground text-center mt-1.5">
              By continuing, you agree to our Terms & Privacy Policy.
            </p>
          </div>
        </form>
      </div>
    </MobileFrame>
  );
}
