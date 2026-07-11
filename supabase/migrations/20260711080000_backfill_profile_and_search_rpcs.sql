-- Live audit (20260624100000) found that most policies/triggers/functions
-- from earlier migrations were never actually applied to the live database,
-- and backfilled some of them — but not these three, even though all three
-- predate that audit (get_my_profile_private: 20260607235751, search_users:
-- 20260608002454, update_my_profile: 20260608005604). Symptoms reported live
-- match exactly what's expected if these are still missing: Profile can't
-- display or save a phone number, and the "start new chat" search finds no
-- other users. Re-creating them here, verbatim from their original
-- migrations, idempotently (CREATE OR REPLACE) so this is safe to run
-- whether or not they already exist.

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

CREATE OR REPLACE FUNCTION public.search_users(_query text, _limit int DEFAULT 50)
RETURNS TABLE(id uuid, display_name text, avatar_url text, is_online boolean, last_seen_at timestamptz, show_last_seen boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT
      trim(coalesce(_query, '')) AS raw,
      regexp_replace(coalesce(_query, ''), '\D', '', 'g') AS digits
  )
  SELECT p.id, p.display_name, p.avatar_url, p.is_online, p.last_seen_at, p.show_last_seen
  FROM public.profiles p, q
  WHERE p.id <> auth.uid()
    AND (
      q.raw = ''
      OR p.display_name ILIKE '%' || q.raw || '%'
      OR (length(q.digits) >= 3 AND regexp_replace(coalesce(p.phone,''), '\D', '', 'g') ILIKE '%' || q.digits || '%')
    )
  ORDER BY
    CASE WHEN q.raw <> '' AND p.display_name ILIKE q.raw || '%' THEN 0 ELSE 1 END,
    p.display_name ASC NULLS LAST
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 50), 100));
$$;
REVOKE ALL ON FUNCTION public.search_users(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_users(text, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_my_profile(_display_name text, _phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _phone IS NOT NULL AND _phone <> '' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE phone = _phone AND id <> v_uid
  ) THEN
    RAISE EXCEPTION 'phone_taken' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (v_uid, NULLIF(trim(coalesce(_display_name,'')), ''), NULLIF(_phone, ''))
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        phone = EXCLUDED.phone;
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_profile(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text) TO authenticated;

-- Verify — should return 3 rows.
SELECT proname FROM pg_proc
WHERE proname IN ('get_my_profile_private', 'search_users', 'update_my_profile')
  AND pronamespace = 'public'::regnamespace;
