-- Rate limit hardening (audit items 1, 3 and 5).
--
-- 1. check_rate_limit could be called by anyone with the public app key
--    (functions are callable by everyone unless revoked, and it never was).
--    A caller could push another network's or person's counter over the limit
--    and lock them out. Now only the server can call it. Edge functions use the
--    service role and log_app_error runs as its owner, so both keep working.
-- 3. email_registered: one indexed lookup in auth.users, for
--    check-email-exists and check-registration-availability. They used to page
--    through the account list 1,000 at a time and stop after 20 pages, so past
--    20,000 accounts a registered email read as "not registered" (and Forgot
--    Password refused real people).
-- 5. rate_limits is cleaned every hour: rows older than 2 days are deleted
--    (the longest window is 1 day). Before, nothing ever deleted them.
--
-- Run after 20261023120000_contact_match_limits.sql. Then deploy
-- check-email-exists, check-registration-availability, request-device-otp,
-- verify-otp-code and submit-report (they share the updated
-- _shared/rateLimit.ts), in any order.
--
-- How to apply: Supabase Dashboard > SQL Editor, paste this file, Run.
-- Safe to run twice. No app rebuild needed.
--
-- How to undo:
--   GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO PUBLIC, anon, authenticated;
--   SELECT cron.unschedule('cleanup-rate-limits');
--   DROP INDEX IF EXISTS public.rate_limits_window_start_idx;
--   DROP FUNCTION IF EXISTS public.email_registered(text);
--   (Then redeploy the previous versions of the functions above, which page
--   through the account list instead of calling email_registered.)

-- 1. Server only.
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- 3. Is this email registered? Server only.
--    Supabase saves emails in lower case, so the first lookup uses the email
--    index. Only when that finds nothing does the second one also compare in
--    lower case, for any account saved with capital letters.
CREATE OR REPLACE FUNCTION public.email_registered(_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v text := lower(trim(coalesce(_email, '')));
BEGIN
  IF v = '' OR length(v) > 255 THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v AND is_sso_user = false) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v);
END;
$$;
REVOKE ALL ON FUNCTION public.email_registered(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_registered(text) TO service_role;

-- 5. Hourly clean-up of old counters (needs pg_cron, already used for the
--    email queue). The index keeps the delete quick as the table grows.
CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx ON public.rate_limits (window_start);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-rate-limits';
    PERFORM cron.schedule(
      'cleanup-rate-limits',
      '17 * * * *',
      $job$DELETE FROM public.rate_limits WHERE window_start < now() - interval '2 days'$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron is not enabled: rate_limits clean-up was not scheduled. Enable pg_cron (Database > Extensions) and run this file again.';
  END IF;
END $$;
