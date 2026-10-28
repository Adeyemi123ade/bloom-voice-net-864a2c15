-- Every account has a phone number, and the database knows its own version.
-- (2026-10-28)
--
-- Why: the live check on 2026-10-28 found every earlier migration applied
-- and all 9 saved numbers correct, but 3 Google accounts with no number at
-- all. Tapping "Continue with Google" creates the account before the person
-- gives a number; the app was meant to send them to the form, but let them
-- in whenever that check failed. Nothing on the server required a number,
-- the Profile screen could erase one, and nothing recorded which migrations
-- had been run.
--
-- 1. app_migrations: a record of the migrations applied to this database.
--    Every migration from now on ends by adding its own row. The ones
--    confirmed live on 2026-10-28 are recorded here. The app's admin page
--    compares the newest row with the one the app expects.
-- 2. profiles.phone must be +country format (like +2348031234567).
-- 3. update_my_profile: a saved number can be changed but not erased, and
--    must be +country format.
-- 4. Sending a message or starting a call needs a saved number. The app
--    asks for it first; this is the rule behind it. The server's own work
--    (backups, functions using the service key) is not affected.
--
-- How to apply: Supabase Dashboard > SQL Editor, paste this whole file, Run.
-- One transaction: all of it applies, or none of it. Safe to run twice.
-- Run it before merging the app change (the app reads app_db_version()).
--
-- How to undo:
--   BEGIN;
--   DROP TRIGGER IF EXISTS messages_need_phone ON public.messages;
--   DROP TRIGGER IF EXISTS calls_need_phone ON public.calls;
--   DROP FUNCTION IF EXISTS public.refuse_without_phone();
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_format;
--   -- update_my_profile: re-run its CREATE FUNCTION from
--   -- 20260711080000_backfill_profile_and_search_rpcs.sql
--   DROP FUNCTION IF EXISTS public.app_db_version();
--   DROP TABLE IF EXISTS public.app_migrations;
--   COMMIT;

BEGIN;

-- ── 1. Record of applied migrations ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.app_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_migrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_migrations TO service_role;

-- Confirmed live by the check of 2026-10-28 (applied_at = that check).
INSERT INTO public.app_migrations (id, applied_at) VALUES
  ('20261017090000', '2026-10-28 04:40+00'),
  ('20261017120000', '2026-10-28 04:40+00'),
  ('20261017130000', '2026-10-28 04:40+00'),
  ('20261017140000', '2026-10-28 04:40+00'),
  ('20261021090000', '2026-10-28 04:40+00'),
  ('20261021120000', '2026-10-28 04:40+00'),
  ('20261023090000', '2026-10-28 04:40+00'),
  ('20261023120000', '2026-10-28 04:40+00'),
  ('20261023150000', '2026-10-28 04:40+00'),
  ('20261024090000', '2026-10-28 04:40+00'),
  ('20261026120000', '2026-10-28 04:40+00')
ON CONFLICT (id) DO NOTHING;

-- The newest migration applied. Not secret: it only names a file.
CREATE OR REPLACE FUNCTION public.app_db_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(id) FROM public.app_migrations;
$$;
REVOKE ALL ON FUNCTION public.app_db_version() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_db_version() TO authenticated, service_role;

-- ── 2. Phone numbers are +country format ───────────────────────────────

-- Numbers saved with spaces or dashes are tidied first; anything that is
-- still not +country format stops the whole file (nothing is changed), so
-- a bad number is never thrown away silently.
UPDATE public.profiles
   SET phone = regexp_replace(phone, '[^0-9+]', '', 'g')
 WHERE phone IS NOT NULL
   AND phone !~ '^\+[1-9][0-9]{6,14}$'
   AND regexp_replace(phone, '[^0-9+]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$';

UPDATE public.profiles SET phone = NULL WHERE phone = '';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_format
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$');

-- ── 3. Profile updates can't erase or misformat the number ─────────────

CREATE OR REPLACE FUNCTION public.update_my_profile(_display_name text, _phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_phone text := nullif(regexp_replace(coalesce(_phone, ''), '[^0-9+]', '', 'g'), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_phone IS NULL THEN
    -- No number given: keep the saved one. Refuse only if there is none.
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND phone IS NOT NULL) THEN
      RAISE EXCEPTION 'phone_required' USING ERRCODE = 'P0001', HINT = 'chichat_no_phone';
    END IF;
  ELSIF v_phone !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023', HINT = 'chichat_invalid_phone';
  ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE phone = v_phone AND id <> v_uid) THEN
    RAISE EXCEPTION 'phone_taken' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (v_uid, nullif(trim(coalesce(_display_name, '')), ''), v_phone)
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone);
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_profile(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text) TO authenticated;

-- ── 4. Messages and calls need a saved number ──────────────────────────

CREATE OR REPLACE FUNCTION public.refuse_without_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- The column naming the person: sender_id (messages) or caller_id (calls).
  v_who uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
BEGIN
  -- Only people using the app; the server's own work is not affected.
  IF coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_who AND phone IS NOT NULL) THEN
    RAISE EXCEPTION 'phone_required' USING ERRCODE = 'P0001', HINT = 'chichat_no_phone';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_without_phone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_need_phone ON public.messages;
CREATE TRIGGER messages_need_phone
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.refuse_without_phone('sender_id');

DROP TRIGGER IF EXISTS calls_need_phone ON public.calls;
CREATE TRIGGER calls_need_phone
  BEFORE INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.refuse_without_phone('caller_id');

-- ── Record this migration (every migration ends like this) ─────────────
INSERT INTO public.app_migrations (id) VALUES ('20261028090000')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Check, after running (should say 20261028090000 and true, true):
--   select public.app_db_version(),
--          exists (select 1 from pg_trigger where tgname = 'messages_need_phone'),
--          exists (select 1 from pg_constraint where conname = 'profiles_phone_format');
