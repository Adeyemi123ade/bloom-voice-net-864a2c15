CREATE TABLE IF NOT EXISTS public.google_signin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intended_email text NOT NULL,
  google_email text NOT NULL,
  matched boolean NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_google_signin_attempts_intended_email_created
  ON public.google_signin_attempts (intended_email, created_at DESC);
ALTER TABLE public.google_signin_attempts ENABLE ROW LEVEL SECURITY;
-- Service role only; no policies for anon/authenticated.
