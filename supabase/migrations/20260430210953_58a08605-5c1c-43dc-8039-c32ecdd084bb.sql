CREATE TABLE IF NOT EXISTS public.auth_otp_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_type text NOT NULL,
  short_code text NOT NULL,
  full_token text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL
);

ALTER TABLE public.auth_otp_aliases ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS auth_otp_aliases_lookup_idx
  ON public.auth_otp_aliases (lower(email), email_type, short_code, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_otp_aliases_expires_at_idx
  ON public.auth_otp_aliases (expires_at);

CREATE OR REPLACE FUNCTION public.cleanup_expired_auth_otp_aliases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.auth_otp_aliases
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON public.auth_otp_aliases FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_auth_otp_aliases() FROM PUBLIC, anon, authenticated;