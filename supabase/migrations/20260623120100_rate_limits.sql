-- Lightweight per-key rate limiting for public, unauthenticated edge functions
-- (initially: check-email-exists, check-user-exists, which are unthrottled
-- email-enumeration oracles per security audit). Service-role only; no RLS
-- policies are added since only edge functions (using the service role key)
-- ever touch this table.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies created -> authenticated/anon roles have zero access; only the
-- service role (used by edge functions) can read/write this table.

-- Atomically increment the counter for the current fixed window and report
-- whether the caller is still under the limit. Using a single UPSERT avoids
-- the read-then-write race a naive JS implementation would have.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key text,
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
  VALUES (_key, _window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO _count;

  RETURN _count <= _max_count;
END;
$$;

-- Best-effort cleanup of old windows; safe to run from a cron or just let it
-- grow slowly (one row per key per window) — add a periodic delete if needed.
