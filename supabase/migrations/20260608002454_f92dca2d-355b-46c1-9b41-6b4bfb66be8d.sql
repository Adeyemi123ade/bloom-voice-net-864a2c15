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