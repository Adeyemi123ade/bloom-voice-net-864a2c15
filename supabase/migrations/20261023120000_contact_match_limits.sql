-- Contact match limit: stop bulk checking of phone numbers.
--
-- Why: match_contacts_by_phone answers "is this number on ChiChat, and who
-- is it?" for every number sent. The app sends the person's own contacts,
-- but a script could send millions of made-up numbers and map every user.
--
-- After this file, each person can check at most:
--   - 10,000 numbers in one go (a very large phone book),
--   - 30,000 numbers an hour,
--   - 100,000 numbers a day.
-- Over the limit the function returns an error (HINT chichat_rate_limited)
-- and the app keeps showing the last result it saved. Signed-out callers get
-- nothing. Matching itself is unchanged: exact numbers only, people who
-- blocked you are left out.
--
-- Run after 20261023090000_contact_privacy.sql.
--
-- How to apply: Supabase Dashboard > SQL Editor, paste this file, Run.
-- Safe to run twice. No app rebuild needed.
--
-- How to undo (no limit again):
--   CREATE OR REPLACE FUNCTION public.match_contacts_by_phone(_phones TEXT[])
--   RETURNS TABLE (phone TEXT, user_id UUID, display_name TEXT, avatar_url TEXT)
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--     SELECT p.phone, p.id, p.display_name, p.avatar_url
--     FROM public.profiles p
--     WHERE p.phone = ANY(_phones)
--       AND p.id <> auth.uid()
--       AND NOT public.has_blocked(p.id, auth.uid());
--   $$;
--   DROP FUNCTION IF EXISTS public.take_rate_limit(text, integer, integer, integer);

-- 1. Like check_rate_limit, but one call can use more than 1 (here: one per number).
CREATE OR REPLACE FUNCTION public.take_rate_limit(
  _key text,
  _amount integer,
  _max_count integer,
  _window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window_start timestamptz;
  _count integer;
BEGIN
  _window_start := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.rate_limits (key, window_start, count)
  VALUES (_key, _window_start, GREATEST(_amount, 0))
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limits.count + GREATEST(_amount, 0)
  RETURNING count INTO _count;

  RETURN _count <= _max_count;
END;
$$;
REVOKE ALL ON FUNCTION public.take_rate_limit(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_rate_limit(text, integer, integer, integer) TO service_role;

-- 2. The contact match, with limits. Same columns as before, so the app needs no change.
--    (plpgsql now, because it writes the usage count.)
DROP FUNCTION IF EXISTS public.match_contacts_by_phone(text[]);
CREATE FUNCTION public.match_contacts_by_phone(_phones TEXT[])
RETURNS TABLE (phone TEXT, user_id UUID, display_name TEXT, avatar_url TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_phones text[];
  v_n integer;
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), '{}')
    INTO v_phones
  FROM unnest(coalesce(_phones, '{}')) AS x
  WHERE x IS NOT NULL AND length(trim(x)) BETWEEN 7 AND 20;

  v_n := coalesce(array_length(v_phones, 1), 0);
  IF v_n = 0 THEN
    RETURN;
  END IF;

  IF v_n > 10000
     OR NOT public.take_rate_limit('match-contacts:1h:' || v_me, v_n, 30000, 3600)
     OR NOT public.take_rate_limit('match-contacts:1d:' || v_me, v_n, 100000, 86400) THEN
    RAISE EXCEPTION 'Too many contact checks, try again later'
      USING HINT = 'chichat_rate_limited', ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT p.phone, p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.phone = ANY(v_phones)
    AND p.id <> v_me
    AND NOT public.has_blocked(p.id, v_me);
END;
$$;
REVOKE ALL ON FUNCTION public.match_contacts_by_phone(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_contacts_by_phone(text[]) TO authenticated, service_role;
