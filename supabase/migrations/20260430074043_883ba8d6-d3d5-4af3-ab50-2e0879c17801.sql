-- Add backup_email column to profiles (nullable, recovery-only)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS backup_email text;

-- Enforce uniqueness only when set (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_backup_email_unique
  ON public.profiles (lower(backup_email))
  WHERE backup_email IS NOT NULL;

-- Validation trigger: backup_email must differ from any user's primary email
-- and must be a valid email format. Also normalize to lowercase.
CREATE OR REPLACE FUNCTION public.validate_backup_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary_email text;
BEGIN
  IF NEW.backup_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Normalize
  NEW.backup_email := lower(trim(NEW.backup_email));

  -- Basic format check
  IF NEW.backup_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid backup email format';
  END IF;

  -- Must not equal this user's own primary email
  SELECT lower(email) INTO v_primary_email FROM auth.users WHERE id = NEW.id;
  IF v_primary_email IS NOT NULL AND v_primary_email = NEW.backup_email THEN
    RAISE EXCEPTION 'Backup email must be different from your primary email';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_backup_email_trigger ON public.profiles;
CREATE TRIGGER validate_backup_email_trigger
  BEFORE INSERT OR UPDATE OF backup_email ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_backup_email();

-- Lookup function for "Forgot email" flow.
-- Returns the user_id whose backup_email matches (case-insensitive).
-- Used by an edge function with service role; not directly callable by clients.
CREATE OR REPLACE FUNCTION public.find_user_by_backup_email(_backup_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles
  WHERE backup_email = lower(trim(_backup_email))
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.find_user_by_backup_email(text) FROM PUBLIC, anon, authenticated;