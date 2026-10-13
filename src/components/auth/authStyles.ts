/**
 * Shared look for the sign-up / sign-in journey (Register, Sign in, Forgot
 * password, Verify email). Change the arrangement here and every auth
 * screen follows, so the journey stays consistent.
 */
export const authStyles = {
  title: "text-[22px] font-bold text-foreground leading-tight tracking-tight",
  subtitle: "text-sm text-muted-foreground mt-1.5 leading-relaxed",
  label: "text-xs font-semibold tracking-wide text-muted-foreground",
  fieldGap: "space-y-3.5",
  primaryButton:
    "w-full h-12 text-[15px] bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl",
  secondaryButton: "w-full h-12 text-[15px] font-semibold rounded-xl gap-2.5",
  footnote: "text-[13px] text-muted-foreground text-center",
  link: "text-accent font-semibold hover:underline",
  error: "text-sm text-destructive mt-1",
} as const;
