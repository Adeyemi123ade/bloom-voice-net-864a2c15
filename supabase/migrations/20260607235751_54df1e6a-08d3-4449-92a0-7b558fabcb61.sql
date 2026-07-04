
-- 1. Profiles: hide sensitive columns from other users via column-level grants.
REVOKE SELECT (phone, backup_email) ON public.profiles FROM authenticated, anon;

-- Secure RPC so the signed-in user can still read their own sensitive fields.
CREATE OR REPLACE FUNCTION public.get_my_profile_private()
RETURNS TABLE(phone text, backup_email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.phone, p.backup_email
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_profile_private() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated;

-- 2. Explicit service-role-only policies for tables with RLS enabled but no policies.
DO $$
BEGIN
  -- auth_otp_aliases
  EXECUTE 'ALTER TABLE public.auth_otp_aliases ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Service role manages otp aliases" ON public.auth_otp_aliases';
  EXECUTE 'CREATE POLICY "Service role manages otp aliases" ON public.auth_otp_aliases FOR ALL TO public USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';

  -- deleted_accounts
  EXECUTE 'ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Service role manages deleted accounts" ON public.deleted_accounts';
  EXECUTE 'CREATE POLICY "Service role manages deleted accounts" ON public.deleted_accounts FOR ALL TO public USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';

  -- device_login_challenges
  EXECUTE 'ALTER TABLE public.device_login_challenges ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Service role manages device challenges" ON public.device_login_challenges';
  EXECUTE 'CREATE POLICY "Service role manages device challenges" ON public.device_login_challenges FOR ALL TO public USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';

  -- google_signin_attempts
  EXECUTE 'ALTER TABLE public.google_signin_attempts ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "Service role manages google attempts" ON public.google_signin_attempts';
  EXECUTE 'CREATE POLICY "Service role manages google attempts" ON public.google_signin_attempts FOR ALL TO public USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';
END $$;

-- Revoke any Data-API access on these sensitive tables so only the service role reaches them.
REVOKE ALL ON public.auth_otp_aliases FROM anon, authenticated;
REVOKE ALL ON public.deleted_accounts FROM anon, authenticated;
REVOKE ALL ON public.device_login_challenges FROM anon, authenticated;
REVOKE ALL ON public.google_signin_attempts FROM anon, authenticated;
GRANT ALL ON public.auth_otp_aliases TO service_role;
GRANT ALL ON public.deleted_accounts TO service_role;
GRANT ALL ON public.device_login_challenges TO service_role;
GRANT ALL ON public.google_signin_attempts TO service_role;

-- 3. Add immutable search_path to remaining functions missing it.
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- 4. Restrict execute on internal email-queue / cleanup helpers to service role only.
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_auth_otp_aliases() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_user_by_backup_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_auth_otp_aliases() TO service_role;
GRANT EXECUTE ON FUNCTION public.find_user_by_backup_email(text) TO service_role;
