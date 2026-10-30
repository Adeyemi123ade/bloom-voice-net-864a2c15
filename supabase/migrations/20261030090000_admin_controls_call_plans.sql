-- Admin controls per person, call plans, and keeping test data out of the
-- admin page (2026-10-30).
--
-- 1. Where reports, feedback and problems come from: each one records
--    whether it was sent from the live app, a preview link or a local copy.
--    Earlier problems get it from the address they saved.
-- 2. Test accounts: an admin can tag a person as a test account. The admin
--    page hides test accounts' reports, feedback, problems and call minutes,
--    and anything sent from a preview link or a local copy, unless
--    "Show test data" is on.
-- 3. Person controls: suspend (optionally until a date), ban (email and
--    phone can't register again), remove (closed for good: can't sign in,
--    can't be messaged or called, not found by contacts; their name stays on
--    the messages already in other people's chats), restore (not for
--    removed accounts). Admins can't be changed from the admin page.
-- 4. Calls per person:
--      Plans: Free (dial pad off) and Premium (dial pad on). Both 20
--      minutes a day. Premium can have an end date; after it the person is
--      on Free again.
--      Per person: dial pad follows the plan, or is switched on or off;
--      daily minutes follow the plan or are set; app to app calls on or off
--      (abuse switch, on by default).
--      Minute balance: kept as a list of additions, ready for selling
--      minutes. Not used to limit calls yet (call_plans.use_balance = false).
--      One dial pad call at a time per person.
--      Dial pad is allowed or refused by one database step, so two calls
--      started at the same moment can't both pass the limit.
-- 5. Admin history: every admin action is recorded (who, what, when).
--
-- After this file, the dial pad is OFF for everyone on the Free plan, which
-- is everyone except the admin account. Switch it on per person on the
-- admin page (People > person > Calls).
--
-- How to apply: Supabase Dashboard > SQL Editor, paste this whole file, Run.
-- One transaction: all of it applies, or none of it. Safe to run twice.
-- Then deploy twilio-voice-token, twilio-voice-twiml and submit-report.
--
-- How to undo:
--   BEGIN;
--   DROP TRIGGER IF EXISTS app_errors_origin ON public.app_errors;
--   DROP TRIGGER IF EXISTS feedback_origin ON public.feedback;
--   DROP FUNCTION IF EXISTS public.set_request_origin();
--   DROP FUNCTION IF EXISTS public.paid_call_begin(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.paid_call_check(uuid);
--   DROP FUNCTION IF EXISTS public.admin_remove_user(uuid, text);
--   DROP FUNCTION IF EXISTS public.admin_set_call_settings(uuid, text, timestamptz, text, integer, boolean);
--   DROP FUNCTION IF EXISTS public.admin_add_minutes(uuid, integer, text);
--   DROP FUNCTION IF EXISTS public.admin_set_test_account(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.admin_user_detail(uuid);
--   UPDATE auth.users SET banned_until = NULL
--     WHERE id IN (SELECT user_id FROM public.account_status WHERE status = 'removed');
--   DELETE FROM public.account_status WHERE status = 'removed';
--   DROP TABLE IF EXISTS public.minute_ledger, public.user_controls, public.call_plans, public.admin_actions;
--   COMMIT;
--   Then run 20261021090000_tester_ready_and_account_safety.sql,
--   20261017140000_block_report_requests.sql (is_block_between only) and
--   20261023120000_contact_match_limits.sql (match_contacts_by_phone only)
--   again to restore the earlier admin and block functions, and redeploy the
--   three functions from the commit before this one.

BEGIN;

-- ── 1. Where things come from ────────────────────────────────────────────
-- 'live' = chichatapp.com or the Android app; 'preview' = a Vercel preview
-- link; 'local' = a copy running on a laptop; 'unknown' = not recorded.
-- Only 'preview' and 'local' are treated as test data; 'unknown' is shown.
CREATE OR REPLACE FUNCTION public.classify_origin(_url text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  h text := lower(coalesce(substring(coalesce(_url, '') FROM '^[a-zA-Z]+://([^/?#]+)'), ''));
BEGIN
  IF h = '' THEN
    RETURN 'unknown';
  END IF;
  -- The Android app's own pages (offline page) are served as https://localhost.
  IF _url ~* '^https://localhost(/|$)' THEN
    RETURN 'live';
  END IF;
  IF h IN ('chichatapp.com', 'www.chichatapp.com', 'bloom-voice-net-864a2c15.vercel.app') THEN
    RETURN 'live';
  END IF;
  IF h LIKE '%.vercel.app' THEN
    RETURN 'preview';
  END IF;
  IF h ~ '^(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.)' THEN
    RETURN 'local';
  END IF;
  RETURN 'unknown';
END;
$$;

ALTER TABLE public.app_errors ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.feedback   ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.reports    ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'unknown';

-- Earlier problems saved the page address.
UPDATE public.app_errors SET origin = public.classify_origin(url) WHERE origin = 'unknown';

-- Rows written by the app (problems, feedback) take the Origin of the
-- browser request that wrote them. Rows written by a server function
-- (reports) are given it by that function.
CREATE OR REPLACE FUNCTION public.set_request_origin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_headers json;
  v_origin text;
BEGIN
  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;
  v_origin := coalesce(v_headers ->> 'origin', v_headers ->> 'referer');
  IF v_origin IS NOT NULL THEN
    NEW.origin := public.classify_origin(v_origin);
  ELSIF TG_TABLE_NAME = 'app_errors' THEN
    NEW.origin := public.classify_origin(NEW.url);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_request_origin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS app_errors_origin ON public.app_errors;
CREATE TRIGGER app_errors_origin BEFORE INSERT ON public.app_errors
  FOR EACH ROW EXECUTE FUNCTION public.set_request_origin();
DROP TRIGGER IF EXISTS feedback_origin ON public.feedback;
CREATE TRIGGER feedback_origin BEFORE INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_request_origin();

-- People can't choose the origin of their own feedback.
REVOKE INSERT ON public.feedback FROM authenticated;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'feedback'
    AND column_name NOT IN ('id', 'status', 'created_at', 'origin');
  EXECUTE format('GRANT INSERT (%s) ON public.feedback TO authenticated', cols);
END $$;

-- ── 2 and 4. Call plans and per person settings ──────────────────────────
CREATE TABLE IF NOT EXISTS public.call_plans (
  id text PRIMARY KEY,
  dial_pad_enabled boolean NOT NULL,
  daily_minutes integer NOT NULL CHECK (daily_minutes BETWEEN 0 AND 600),
  use_balance boolean NOT NULL DEFAULT false,
  skip_new_account_wait boolean NOT NULL DEFAULT false
);
ALTER TABLE public.call_plans ENABLE ROW LEVEL SECURITY;
-- No policies: read through the functions below.
INSERT INTO public.call_plans (id, dial_pad_enabled, daily_minutes, use_balance, skip_new_account_wait) VALUES
  ('free',    false, 20, false, false),
  ('premium', true,  20, false, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_controls (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' REFERENCES public.call_plans(id),
  plan_expires_at timestamptz,
  dial_pad_override boolean,                -- NULL = follow the plan
  daily_minutes_override integer CHECK (daily_minutes_override BETWEEN 0 AND 600),
  app_calls_enabled boolean NOT NULL DEFAULT true,
  is_test boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_controls ENABLE ROW LEVEL SECURITY;
-- No policies: people read their own call access through get_my_call_access().

-- The admin account starts on Premium, so the dial pad keeps working there.
INSERT INTO public.user_controls (user_id, plan)
SELECT user_id, 'premium' FROM public.app_admins
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.minute_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  minutes integer NOT NULL CHECK (minutes <> 0 AND abs(minutes) <= 100000),
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS minute_ledger_user_idx ON public.minute_ledger (user_id, created_at DESC);
ALTER TABLE public.minute_ledger ENABLE ROW LEVEL SECURITY;

-- A dial pad call is charged to the balance only when the plan uses it.
ALTER TABLE public.outbound_calls ADD COLUMN IF NOT EXISTS charged boolean NOT NULL DEFAULT false;

-- ── 5. Admin history ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid,                      -- no link: kept after an account is gone
  target_email text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON public.admin_actions (target_user_id, created_at DESC);
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.log_admin_action(_target uuid, _action text, _details jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.admin_actions (admin_id, target_user_id, target_email, action, details)
  VALUES (auth.uid(), _target, (SELECT lower(email) FROM auth.users WHERE id = _target), _action,
          coalesce(_details, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.log_admin_action(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- An admin can't change their own account or another admin's from the admin page.
CREATE OR REPLACE FUNCTION public.admin_target_guard(_user uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  IF _user IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user) THEN
    RAISE EXCEPTION 'no_such_user' USING ERRCODE = 'P0001';
  END IF;
  IF _user = auth.uid() OR public.is_app_admin(_user) THEN
    RAISE EXCEPTION 'cannot_change_admin' USING ERRCODE = 'P0001';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_target_guard(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. Account states ────────────────────────────────────────────────────
ALTER TABLE public.account_status DROP CONSTRAINT IF EXISTS account_status_status_check;
ALTER TABLE public.account_status ADD CONSTRAINT account_status_status_check
  CHECK (status IN ('active', 'suspended', 'removed'));
ALTER TABLE public.account_status ADD COLUMN IF NOT EXISTS suspended_until timestamptz;

-- Suspended (until the end date, if one was set) or removed. Every existing
-- check uses this: messages, calls, dial pad, the app's own status check.
CREATE OR REPLACE FUNCTION public.is_suspended(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_status
    WHERE user_id = _uid
      AND (status = 'removed'
           OR (status = 'suspended' AND (suspended_until IS NULL OR suspended_until > now())))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_account_removed(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.account_status WHERE user_id = _uid AND status = 'removed');
$$;
REVOKE ALL ON FUNCTION public.is_account_removed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_removed(uuid) TO service_role;

-- For the chat screen: which of these people (only people I share a chat
-- with) have been removed, so the message box can say so.
CREATE OR REPLACE FUNCTION public.removed_chat_partners(_ids uuid[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id FROM public.account_status s
  WHERE s.status = 'removed'
    AND s.user_id = ANY(coalesce(_ids, '{}'))
    AND auth.uid() IS NOT NULL
    AND public.shares_conversation(auth.uid(), s.user_id)
  LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.removed_chat_partners(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.removed_chat_partners(uuid[]) TO authenticated;

-- Nobody can message or call a removed account (or be messaged or called
-- by one). The message and call rules already use this check.
CREATE OR REPLACE FUNCTION public.is_block_between(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  )
  OR EXISTS (
    SELECT 1 FROM public.account_status
    WHERE user_id IN (_a, _b) AND status = 'removed'
  );
$$;

-- A removed account isn't found from anyone's phone book.
CREATE OR REPLACE FUNCTION public.match_contacts_by_phone(_phones TEXT[])
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
    AND NOT public.has_blocked(p.id, v_me)
    AND NOT public.is_account_removed(p.id);
END;
$$;
REVOKE ALL ON FUNCTION public.match_contacts_by_phone(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_contacts_by_phone(text[]) TO authenticated, service_role;

-- ── 4. Effective call rules for one person ───────────────────────────────
CREATE OR REPLACE FUNCTION public.call_rules(_uid uuid)
RETURNS TABLE (
  plan text, plan_expires_at timestamptz, dial_pad_enabled boolean, daily_seconds integer,
  use_balance boolean, skip_new_account_wait boolean, app_calls_enabled boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT uc.plan, uc.plan_expires_at, uc.dial_pad_override, uc.daily_minutes_override, uc.app_calls_enabled
    FROM public.user_controls uc WHERE uc.user_id = _uid
  ), eff AS (
    SELECT CASE
             WHEN c.plan IS NOT NULL AND (c.plan_expires_at IS NULL OR c.plan_expires_at > now()) THEN c.plan
             ELSE 'free'
           END AS plan_id
    FROM (SELECT 1) one LEFT JOIN c ON true
  )
  SELECT p.id,
         (SELECT c.plan_expires_at FROM c),
         coalesce((SELECT c.dial_pad_override FROM c), p.dial_pad_enabled),
         coalesce((SELECT c.daily_minutes_override FROM c), p.daily_minutes) * 60,
         p.use_balance,
         p.skip_new_account_wait OR coalesce((SELECT c.dial_pad_override FROM c), false),
         coalesce((SELECT c.app_calls_enabled FROM c), true)
  FROM eff JOIN public.call_plans p ON p.id = eff.plan_id;
$$;
REVOKE ALL ON FUNCTION public.call_rules(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.call_rules(uuid) TO service_role;

-- Seconds of dial pad calls used today (UTC day). A call still running, or
-- whose end report never came, counts for the time since it started, up to
-- its own limit (same rule as before).
CREATE OR REPLACE FUNCTION public.paid_seconds_today(_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(
           CASE WHEN o.duration_seconds IS NOT NULL THEN greatest(o.duration_seconds, 0)
                ELSE greatest(0, least(extract(epoch FROM now() - o.started_at)::int, o.max_seconds))
           END), 0)::int
  FROM public.outbound_calls o
  WHERE o.user_id = _uid AND o.started_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
$$;
REVOKE ALL ON FUNCTION public.paid_seconds_today(uuid) FROM PUBLIC, anon, authenticated;

-- Minutes left on the balance: additions minus charged calls, each started
-- minute counted (as the phone company bills it).
CREATE OR REPLACE FUNCTION public.minute_balance(_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (coalesce((SELECT sum(minutes) FROM public.minute_ledger WHERE user_id = _uid), 0)
        - coalesce((SELECT sum(ceil(
              CASE WHEN o.duration_seconds IS NOT NULL THEN greatest(o.duration_seconds, 0)
                   ELSE greatest(0, least(extract(epoch FROM now() - o.started_at)::int, o.max_seconds))
              END / 60.0))
            FROM public.outbound_calls o WHERE o.user_id = _uid AND o.charged), 0))::int;
$$;
REVOKE ALL ON FUNCTION public.minute_balance(uuid) FROM PUBLIC, anon, authenticated;

-- Can this person make a dial pad call now? Used before the call starts
-- (twilio-voice-token) and inside paid_call_begin.
--   reason: suspended | off | too_new | busy | daily_limit | no_balance
CREATE OR REPLACE FUNCTION public.paid_call_check(_uid uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_created timestamptz;
  v_left integer;
  v_daily_used integer;
BEGIN
  IF public.is_suspended(_uid) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'suspended');
  END IF;
  SELECT * INTO r FROM public.call_rules(_uid);
  IF r IS NULL OR NOT r.dial_pad_enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'off');
  END IF;
  SELECT created_at INTO v_created FROM auth.users WHERE id = _uid;
  IF v_created IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'suspended');
  END IF;
  IF NOT r.skip_new_account_wait AND v_created > now() - interval '24 hours' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'too_new');
  END IF;
  -- One dial pad call at a time: a call without an end report that could
  -- still be running.
  IF EXISTS (
    SELECT 1 FROM public.outbound_calls o
    WHERE o.user_id = _uid AND o.duration_seconds IS NULL
      AND o.started_at > now() - make_interval(secs => o.max_seconds + 120)
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'busy');
  END IF;
  v_daily_used := public.paid_seconds_today(_uid);
  v_left := r.daily_seconds - v_daily_used;
  IF v_left < 30 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily_limit',
                              'daily_minutes', r.daily_seconds / 60);
  END IF;
  IF r.use_balance THEN
    v_left := least(v_left, public.minute_balance(_uid) * 60);
    IF v_left < 30 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'no_balance');
    END IF;
  END IF;
  RETURN jsonb_build_object('allowed', true, 'seconds_left', least(v_left, 1800),
                            'daily_minutes', r.daily_seconds / 60, 'use_balance', r.use_balance);
END;
$$;
REVOKE ALL ON FUNCTION public.paid_call_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paid_call_check(uuid) TO service_role;

-- Check and record a dial pad call in one step. Calls by the same person
-- wait for each other here, so two calls at once can't both pass.
-- Returns {allowed:true, id, seconds} or {allowed:false, reason}.
CREATE OR REPLACE FUNCTION public.paid_call_begin(_uid uuid, _to text, _call_sid text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_check jsonb;
  v_id uuid;
  v_seconds integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('paid-call:' || _uid::text));
  -- The same Twilio call asking twice gets the same answer.
  IF _call_sid IS NOT NULL THEN
    SELECT id, max_seconds INTO v_id, v_seconds FROM public.outbound_calls WHERE call_sid = _call_sid LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object('allowed', true, 'id', v_id, 'seconds', v_seconds);
    END IF;
  END IF;
  v_check := public.paid_call_check(_uid);
  IF NOT (v_check ->> 'allowed')::boolean THEN
    RETURN v_check;
  END IF;
  v_seconds := (v_check ->> 'seconds_left')::int;
  INSERT INTO public.outbound_calls (user_id, to_number, call_sid, max_seconds, charged)
  VALUES (_uid, left(_to, 32), _call_sid, v_seconds, coalesce((v_check ->> 'use_balance')::boolean, false))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('allowed', true, 'id', v_id, 'seconds', v_seconds);
END;
$$;
REVOKE ALL ON FUNCTION public.paid_call_begin(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paid_call_begin(uuid, text, text) TO service_role;

-- What the app may show the person about their own calls.
CREATE OR REPLACE FUNCTION public.get_my_call_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO r FROM public.call_rules(auth.uid());
  RETURN jsonb_build_object(
    'dial_pad', coalesce(r.dial_pad_enabled, false) AND NOT public.is_suspended(auth.uid()),
    'daily_minutes', coalesce(r.daily_seconds, 0) / 60,
    'minutes_left_today', greatest(0, coalesce(r.daily_seconds, 0) - public.paid_seconds_today(auth.uid())) / 60,
    'app_calls', coalesce(r.app_calls_enabled, true)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_call_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_call_access() TO authenticated;

-- App to app calls: the abuse switch. Added to the existing call rule
-- (suspended, hourly limit) without changing the rest of it.
CREATE OR REPLACE FUNCTION public.refuse_call_when_limited()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent integer;
  v_max integer;
BEGIN
  IF public.is_suspended(NEW.caller_id) THEN
    RAISE EXCEPTION 'suspended' USING ERRCODE = 'P0001', HINT = 'chichat_suspended';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_controls WHERE user_id = NEW.caller_id AND NOT app_calls_enabled) THEN
    RAISE EXCEPTION 'calls_off' USING ERRCODE = 'P0001', HINT = 'chichat_calls_off';
  END IF;
  SELECT count(*) INTO v_recent FROM public.calls
  WHERE caller_id = NEW.caller_id AND created_at > now() - interval '1 hour';
  v_max := CASE WHEN public.account_is_new(NEW.caller_id) THEN 20 ELSE 60 END;
  IF v_recent >= v_max THEN
    RAISE EXCEPTION 'limit' USING ERRCODE = 'P0001', HINT = 'chichat_limit';
  END IF;
  RETURN NEW;
END;
$$;

-- ── Admin functions ──────────────────────────────────────────────────────
-- Test data filter used by the lists below.
CREATE OR REPLACE FUNCTION public.is_test_account(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_controls WHERE user_id = _uid AND is_test);
$$;
REVOKE ALL ON FUNCTION public.is_test_account(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN jsonb_build_object(
    'users', (SELECT count(*) FROM auth.users u WHERE NOT public.is_test_account(u.id)),
    'new_users_7d', (SELECT count(*) FROM auth.users u
                     WHERE u.created_at > now() - interval '7 days' AND NOT public.is_test_account(u.id)),
    'suspended', (SELECT count(*) FROM public.account_status s WHERE public.is_suspended(s.user_id)
                    AND s.status = 'suspended'),
    'removed', (SELECT count(*) FROM public.account_status WHERE status = 'removed'),
    'open_reports', (SELECT count(*) FROM public.reports r WHERE r.status = 'open'
                       AND r.origin NOT IN ('preview', 'local') AND NOT public.is_test_account(r.reporter_id)),
    'new_feedback', (SELECT count(*) FROM public.feedback f WHERE f.status = 'new'
                       AND f.origin NOT IN ('preview', 'local') AND NOT public.is_test_account(f.user_id)),
    'errors_24h', (SELECT coalesce(sum(e.times), 0) FROM public.app_errors e
                     WHERE e.last_seen_at > now() - interval '1 day'
                       AND e.origin NOT IN ('preview', 'local') AND NOT public.is_test_account(e.user_id)),
    'paid_minutes_today', (
      SELECT coalesce(round(sum(coalesce(o.duration_seconds, 0)) / 60.0, 1), 0)
      FROM public.outbound_calls o WHERE o.started_at >= date_trunc('day', now())
        AND NOT public.is_test_account(o.user_id)
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_find_users(text, int);
CREATE OR REPLACE FUNCTION public.admin_find_users(_query text DEFAULT '', _limit int DEFAULT 50)
RETURNS TABLE (
  id uuid, email text, display_name text, phone text, created_at timestamptz,
  last_sign_in_at timestamptz, status text, status_reason text, reports_against bigint,
  suspended_until timestamptz, is_test boolean, is_admin boolean, plan text, dial_pad boolean, app_calls boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q text := trim(coalesce(_query, ''));
  d text := public.phone_digits(_query);
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY
  SELECT u.id, u.email::text, p.display_name, p.phone, u.created_at, u.last_sign_in_at,
         CASE WHEN s.status = 'removed' THEN 'removed'
              WHEN public.is_suspended(u.id) THEN 'suspended'
              ELSE 'active' END,
         s.reason,
         (SELECT count(*) FROM public.reports r WHERE r.reported_user_id = u.id),
         CASE WHEN s.status = 'suspended' THEN s.suspended_until END,
         coalesce(c.is_test, false),
         public.is_app_admin(u.id),
         cr.plan, cr.dial_pad_enabled, cr.app_calls_enabled
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.account_status s ON s.user_id = u.id
  LEFT JOIN public.user_controls c ON c.user_id = u.id
  LEFT JOIN LATERAL public.call_rules(u.id) cr ON true
  WHERE q = ''
     OR u.email ILIKE '%' || q || '%'
     OR p.display_name ILIKE '%' || q || '%'
     OR (d IS NOT NULL AND length(d) >= 3 AND public.phone_digits(p.phone) LIKE '%' || d || '%')
     OR u.id::text = q
  ORDER BY u.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 50), 200));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_user_detail(_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  c record;
BEGIN
  PERFORM public.admin_guard();
  SELECT * INTO r FROM public.call_rules(_user);
  SELECT * INTO c FROM public.user_controls WHERE user_id = _user;
  RETURN jsonb_build_object(
    'plan', coalesce(c.plan, 'free'),
    'plan_expires_at', c.plan_expires_at,
    'effective_plan', r.plan,
    'dial_pad_override', c.dial_pad_override,
    'daily_minutes_override', c.daily_minutes_override,
    'dial_pad', r.dial_pad_enabled,
    'daily_minutes', r.daily_seconds / 60,
    'app_calls', r.app_calls_enabled,
    'is_test', coalesce(c.is_test, false),
    'balance_minutes', public.minute_balance(_user),
    'balance_in_use', r.use_balance,
    'used_today_minutes', round(public.paid_seconds_today(_user) / 60.0, 1),
    'used_30d_minutes', (SELECT coalesce(round(sum(coalesce(duration_seconds, 0)) / 60.0, 1), 0)
                         FROM public.outbound_calls WHERE user_id = _user AND started_at > now() - interval '30 days'),
    'banned', EXISTS (SELECT 1 FROM public.banned_identities WHERE user_id = _user),
    'plans', (SELECT jsonb_agg(jsonb_build_object('id', id, 'dial_pad', dial_pad_enabled,
                                                  'daily_minutes', daily_minutes) ORDER BY id)
              FROM public.call_plans),
    'history', (SELECT coalesce(jsonb_agg(h ORDER BY h.created_at DESC), '[]'::jsonb) FROM (
                  SELECT a.created_at, a.action, a.details, ad.email AS admin_email
                  FROM public.admin_actions a LEFT JOIN auth.users ad ON ad.id = a.admin_id
                  WHERE a.target_user_id = _user
                  ORDER BY a.created_at DESC LIMIT 30) h),
    'minutes_added', (SELECT coalesce(jsonb_agg(m ORDER BY m.created_at DESC), '[]'::jsonb) FROM (
                  SELECT created_at, minutes, note FROM public.minute_ledger
                  WHERE user_id = _user ORDER BY created_at DESC LIMIT 30) m)
  );
END;
$$;

-- Suspend, optionally until a date. With _ban, the email and phone also
-- can't be used to register again.
DROP FUNCTION IF EXISTS public.admin_suspend_user(uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.admin_suspend_user(_user uuid, _reason text, _ban boolean DEFAULT true,
                                          _until timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_phone text;
BEGIN
  PERFORM public.admin_target_guard(_user);
  IF public.is_account_removed(_user) THEN
    RAISE EXCEPTION 'already_removed' USING ERRCODE = 'P0001';
  END IF;
  IF _until IS NOT NULL AND _until <= now() THEN
    RAISE EXCEPTION 'bad_date' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.account_status (user_id, status, reason, changed_by, changed_at, suspended_until)
  VALUES (_user, 'suspended', left(_reason, 500), auth.uid(), now(), _until)
  ON CONFLICT (user_id) DO UPDATE
    SET status = 'suspended', reason = EXCLUDED.reason, changed_by = EXCLUDED.changed_by,
        changed_at = now(), suspended_until = EXCLUDED.suspended_until;
  IF _ban THEN
    SELECT lower(email) INTO v_email FROM auth.users WHERE id = _user;
    SELECT public.phone_digits(phone) INTO v_phone FROM public.profiles WHERE id = _user;
    IF v_email IS NOT NULL THEN
      INSERT INTO public.banned_identities (kind, value, user_id, reason, created_by)
      VALUES ('email', v_email, _user, left(_reason, 500), auth.uid()) ON CONFLICT DO NOTHING;
    END IF;
    IF v_phone IS NOT NULL THEN
      INSERT INTO public.banned_identities (kind, value, user_id, reason, created_by)
      VALUES ('phone', v_phone, _user, left(_reason, 500), auth.uid()) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  BEGIN
    DELETE FROM auth.sessions WHERE user_id = _user;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  -- No more call alerts on their phones.
  DELETE FROM public.device_push_tokens WHERE user_id = _user;
  -- A call they are on ends.
  UPDATE public.calls
     SET status = CASE WHEN status = 'ringing' THEN 'missed' ELSE 'ended' END, ended_at = now()
   WHERE (caller_id = _user OR callee_id = _user) AND status IN ('ringing', 'accepted');
  UPDATE public.reports SET status = 'actioned' WHERE reported_user_id = _user AND status = 'open';
  PERFORM public.log_admin_action(_user, CASE WHEN _ban THEN 'ban' ELSE 'suspend' END,
    jsonb_build_object('reason', left(_reason, 500), 'until', _until));
END;
$$;

-- Remove: closed for good. Can't sign in again, can't be messaged or
-- called, not found from contacts, email and phone can't register again.
-- Their messages stay in other people's chats under their name.
CREATE OR REPLACE FUNCTION public.admin_remove_user(_user uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_target_guard(_user);
  IF coalesce(trim(_reason), '') = '' THEN
    RAISE EXCEPTION 'reason_needed' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.admin_suspend_user(_user, _reason, true, NULL);
  UPDATE public.account_status
     SET status = 'removed', suspended_until = NULL, changed_at = now(), changed_by = auth.uid()
   WHERE user_id = _user;
  -- Sign-in refused by the sign-in service itself, not only by ChiChat.
  BEGIN
    UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = _user;
    DELETE FROM auth.refresh_tokens WHERE user_id = _user::text;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  DELETE FROM public.typing_indicators WHERE user_id = _user;
  UPDATE public.profiles SET is_online = false WHERE id = _user;
  PERFORM public.log_admin_action(_user, 'remove', jsonb_build_object('reason', left(_reason, 500)));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_user(_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_target_guard(_user);
  IF public.is_account_removed(_user) THEN
    RAISE EXCEPTION 'removed_is_final' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.account_status
     SET status = 'active', reason = NULL, suspended_until = NULL, changed_by = auth.uid(), changed_at = now()
   WHERE user_id = _user;
  DELETE FROM public.banned_identities WHERE user_id = _user;
  PERFORM public.log_admin_action(_user, 'restore');
END;
$$;

-- Calls for one person. _dial_pad: 'plan' (follow the plan), 'on' or 'off'.
-- _daily_minutes NULL = follow the plan.
CREATE OR REPLACE FUNCTION public.admin_set_call_settings(
  _user uuid, _plan text, _plan_expires_at timestamptz, _dial_pad text,
  _daily_minutes integer, _app_calls boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_override boolean;
BEGIN
  PERFORM public.admin_target_guard(_user);
  IF NOT EXISTS (SELECT 1 FROM public.call_plans WHERE id = _plan) THEN
    RAISE EXCEPTION 'bad_plan' USING ERRCODE = 'P0001';
  END IF;
  IF _dial_pad NOT IN ('plan', 'on', 'off') THEN
    RAISE EXCEPTION 'bad_dial_pad' USING ERRCODE = 'P0001';
  END IF;
  IF _daily_minutes IS NOT NULL AND (_daily_minutes < 0 OR _daily_minutes > 600) THEN
    RAISE EXCEPTION 'bad_minutes' USING ERRCODE = 'P0001';
  END IF;
  IF _plan = 'free' AND _plan_expires_at IS NOT NULL THEN
    _plan_expires_at := NULL;
  END IF;
  v_override := CASE _dial_pad WHEN 'on' THEN true WHEN 'off' THEN false ELSE NULL END;
  INSERT INTO public.user_controls (user_id, plan, plan_expires_at, dial_pad_override,
                                    daily_minutes_override, app_calls_enabled, updated_by, updated_at)
  VALUES (_user, _plan, _plan_expires_at, v_override, _daily_minutes, coalesce(_app_calls, true), auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET
    plan = EXCLUDED.plan, plan_expires_at = EXCLUDED.plan_expires_at,
    dial_pad_override = EXCLUDED.dial_pad_override, daily_minutes_override = EXCLUDED.daily_minutes_override,
    app_calls_enabled = EXCLUDED.app_calls_enabled, updated_by = EXCLUDED.updated_by, updated_at = now();
  PERFORM public.log_admin_action(_user, 'calls', jsonb_build_object(
    'plan', _plan, 'until', _plan_expires_at, 'dial_pad', _dial_pad,
    'daily_minutes', _daily_minutes, 'app_calls', coalesce(_app_calls, true)));
END;
$$;

-- Add (or, with a negative number, take back) minutes on the balance.
CREATE OR REPLACE FUNCTION public.admin_add_minutes(_user uuid, _minutes integer, _note text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_target_guard(_user);
  IF _minutes IS NULL OR _minutes = 0 OR abs(_minutes) > 100000 THEN
    RAISE EXCEPTION 'bad_minutes' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.minute_ledger (user_id, minutes, note, created_by)
  VALUES (_user, _minutes, left(_note, 200), auth.uid());
  PERFORM public.log_admin_action(_user, 'minutes', jsonb_build_object('minutes', _minutes, 'note', left(_note, 200)));
  RETURN public.minute_balance(_user);
END;
$$;

-- Tag or untag a test account. Admin accounts can be tagged too (they are
-- usually the ones testing), so this checks only that the caller is an admin.
CREATE OR REPLACE FUNCTION public.admin_set_test_account(_user uuid, _is_test boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user) THEN
    RAISE EXCEPTION 'no_such_user' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.user_controls (user_id, is_test, updated_by, updated_at)
  VALUES (_user, coalesce(_is_test, false), auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET is_test = EXCLUDED.is_test, updated_by = EXCLUDED.updated_by, updated_at = now();
  PERFORM public.log_admin_action(_user, CASE WHEN _is_test THEN 'test_on' ELSE 'test_off' END);
END;
$$;

-- Lists, with test data hidden unless asked for.
DROP FUNCTION IF EXISTS public.admin_list_reports(text, int);
CREATE OR REPLACE FUNCTION public.admin_list_reports(_status text DEFAULT 'open', _limit int DEFAULT 100,
                                          _show_test boolean DEFAULT false)
RETURNS TABLE (
  id uuid, created_at timestamptz, status text, reason text, details text, also_blocked boolean,
  message_snapshot jsonb, reporter_id uuid, reporter_name text, reporter_email text,
  reported_user_id uuid, reported_name text, reported_email text, reported_status text,
  reports_against bigint, origin text, is_test boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY
  SELECT x.* FROM (
    SELECT r.id, r.created_at, r.status, r.reason, r.details, r.also_blocked, r.message_snapshot,
           r.reporter_id, rp.display_name, ru.email::text,
           r.reported_user_id, dp.display_name, du.email::text,
           CASE WHEN s.status = 'removed' THEN 'removed'
                WHEN public.is_suspended(r.reported_user_id) THEN 'suspended' ELSE 'active' END,
           (SELECT count(*) FROM public.reports z WHERE z.reported_user_id = r.reported_user_id),
           r.origin,
           (r.origin IN ('preview', 'local') OR public.is_test_account(r.reporter_id)) AS t
    FROM public.reports r
    LEFT JOIN public.profiles rp ON rp.id = r.reporter_id
    LEFT JOIN auth.users ru ON ru.id = r.reporter_id
    LEFT JOIN public.profiles dp ON dp.id = r.reported_user_id
    LEFT JOIN auth.users du ON du.id = r.reported_user_id
    LEFT JOIN public.account_status s ON s.user_id = r.reported_user_id
    WHERE _status IS NULL OR _status = '' OR r.status = _status
  ) x
  WHERE coalesce(_show_test, false) OR NOT x.t
  ORDER BY x.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 100), 500));
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_errors(int);
CREATE OR REPLACE FUNCTION public.admin_list_errors(_limit int DEFAULT 100, _show_test boolean DEFAULT false)
RETURNS TABLE (
  id uuid, kind text, message text, stack text, url text, app_build text, platform text,
  user_agent text, language text, times integer, first_seen_at timestamptz, last_seen_at timestamptz,
  user_id uuid, user_email text, origin text, is_test boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY
  SELECT e.id, e.kind, e.message, e.stack, e.url, e.app_build, e.platform, e.user_agent, e.language,
         e.times, e.first_seen_at, e.last_seen_at, e.user_id, u.email::text, e.origin,
         (e.origin IN ('preview', 'local') OR public.is_test_account(e.user_id))
  FROM public.app_errors e LEFT JOIN auth.users u ON u.id = e.user_id
  WHERE coalesce(_show_test, false)
     OR NOT (e.origin IN ('preview', 'local') OR public.is_test_account(e.user_id))
  ORDER BY e.last_seen_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 100), 500));
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_feedback(int);
CREATE OR REPLACE FUNCTION public.admin_list_feedback(_limit int DEFAULT 100, _show_test boolean DEFAULT false)
RETURNS TABLE (
  id uuid, created_at timestamptz, status text, category text, message text, screenshot_path text,
  app_build text, platform text, device text, language text, page text,
  user_id uuid, display_name text, email text, origin text, is_test boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY
  SELECT f.id, f.created_at, f.status, f.category, f.message, f.screenshot_path, f.app_build,
         f.platform, f.device, f.language, f.page, f.user_id, p.display_name, u.email::text, f.origin,
         (f.origin IN ('preview', 'local') OR public.is_test_account(f.user_id))
  FROM public.feedback f
  LEFT JOIN public.profiles p ON p.id = f.user_id
  LEFT JOIN auth.users u ON u.id = f.user_id
  WHERE coalesce(_show_test, false)
     OR NOT (f.origin IN ('preview', 'local') OR public.is_test_account(f.user_id))
  ORDER BY f.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 100), 500));
END;
$$;

DROP FUNCTION IF EXISTS public.admin_call_minutes(int);
CREATE OR REPLACE FUNCTION public.admin_call_minutes(_days int DEFAULT 1, _show_test boolean DEFAULT false)
RETURNS TABLE (user_id uuid, display_name text, email text, calls bigint, minutes numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY
  SELECT o.user_id, p.display_name, u.email::text, count(*),
         round(sum(coalesce(o.duration_seconds, 0)) / 60.0, 1)
  FROM public.outbound_calls o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  LEFT JOIN auth.users u ON u.id = o.user_id
  WHERE o.started_at >= date_trunc('day', now()) - make_interval(days => GREATEST(coalesce(_days, 1), 1) - 1)
    AND (coalesce(_show_test, false) OR NOT public.is_test_account(o.user_id))
  GROUP BY o.user_id, p.display_name, u.email
  ORDER BY 5 DESC;
END;
$$;

-- Admin functions: signed-in callers only (each checks admin itself).
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'admin_overview()', 'admin_find_users(text, int)', 'admin_user_detail(uuid)',
    'admin_suspend_user(uuid, text, boolean, timestamptz)', 'admin_remove_user(uuid, text)',
    'admin_restore_user(uuid)', 'admin_set_call_settings(uuid, text, timestamptz, text, integer, boolean)',
    'admin_add_minutes(uuid, integer, text)', 'admin_set_test_account(uuid, boolean)',
    'admin_list_reports(text, int, boolean)', 'admin_list_errors(int, boolean)',
    'admin_list_feedback(int, boolean)', 'admin_call_minutes(int, boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.classify_origin(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.call_rules(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.paid_seconds_today(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.minute_balance(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.paid_call_check(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.paid_call_begin(uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_test_account(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_account_removed(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.log_admin_action(uuid, text, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_target_guard(uuid) FROM authenticated;

-- ── Record this migration ──────────────────────────────────────────────
INSERT INTO public.app_migrations (id) VALUES ('20261030090000')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Check, after running (should say 20261030090000, 2, 1, false):
--   select public.app_db_version(),
--          (select count(*) from public.call_plans),
--          (select count(*) from public.user_controls where plan = 'premium'),
--          has_function_privilege('authenticated', 'public.paid_call_begin(uuid,text,text)', 'EXECUTE');
