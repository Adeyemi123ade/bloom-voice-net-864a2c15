-- Ready for testers, and account safety.
--
--   1. App problems (crashes and errors) are saved here so they can be seen
--      on the admin page. Anyone can send one (also before signing in),
--      limited per person per hour.
--   2. Feedback from testers, with an optional screenshot (private bucket
--      "feedback"; only the person who sent it and the admin can open it).
--   3. Account safety: suspend and restore accounts, a ban list of emails
--      and phone numbers (a suspended person can't register again with the
--      same details), limits for new accounts, and admin-only functions for
--      the admin page.
--
-- Everything is added on top of what exists; no existing table, rule or
-- function is changed.
--
-- Apply: Supabase Dashboard > SQL Editor, paste this whole file, Run.
-- Check: the last statement lists the admin account (should be 1 row).
-- Undo:  see the end of this file.

-- ── Admins ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
-- No policies: nobody reads or writes this table from the app.

CREATE OR REPLACE FUNCTION public.is_app_admin(_uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = _uid);
$$;
REVOKE ALL ON FUNCTION public.is_app_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin(uuid) TO authenticated, service_role;

-- The first admin: Sulaimon's account.
INSERT INTO public.app_admins (user_id)
SELECT id FROM auth.users WHERE lower(email) = 'teshoade2020@gmail.com'
ON CONFLICT DO NOTHING;

-- ── 1. App problems ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  message text NOT NULL,
  stack text,
  url text,
  app_build text,
  platform text,
  user_agent text,
  language text,
  times integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_errors_last_seen_idx ON public.app_errors (last_seen_at DESC);
ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;
-- No policies: written by log_app_error(), read by admin functions.

CREATE OR REPLACE FUNCTION public.log_app_error(
  _kind text, _message text, _stack text, _url text,
  _app_build text, _platform text, _user_agent text, _language text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg text := left(coalesce(nullif(trim(_message), ''), 'unknown'), 1000);
  v_id uuid;
BEGIN
  IF NOT public.check_rate_limit(
    'app-error:' || coalesce(v_uid::text, 'anon'),
    CASE WHEN v_uid IS NULL THEN 300 ELSE 60 END,
    3600
  ) THEN
    RETURN;
  END IF;
  -- The same problem for the same person within a day is counted, not repeated.
  SELECT id INTO v_id FROM public.app_errors
  WHERE message = v_msg
    AND user_id IS NOT DISTINCT FROM v_uid
    AND app_build IS NOT DISTINCT FROM left(_app_build, 64)
    AND last_seen_at > now() - interval '1 day'
  ORDER BY last_seen_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.app_errors SET times = times + 1, last_seen_at = now(), url = left(_url, 500)
    WHERE id = v_id;
    RETURN;
  END IF;
  INSERT INTO public.app_errors (user_id, kind, message, stack, url, app_build, platform, user_agent, language)
  VALUES (v_uid, left(coalesce(_kind, 'error'), 40), v_msg, left(_stack, 4000), left(_url, 500),
          left(_app_build, 64), left(_platform, 40), left(_user_agent, 400), left(_language, 10));
END;
$$;
REVOKE ALL ON FUNCTION public.log_app_error(text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_app_error(text, text, text, text, text, text, text, text) TO anon, authenticated;

-- ── 2. Feedback ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  screenshot_path text,
  app_build text,
  platform text,
  device text,
  language text,
  page text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON public.feedback (created_at DESC);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.feedback TO authenticated;
DROP POLICY IF EXISTS "Users send feedback" ON public.feedback;
CREATE POLICY "Users send feedback" ON public.feedback
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users see own feedback" ON public.feedback;
CREATE POLICY "Users see own feedback" ON public.feedback
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_app_admin());

-- Screenshots: private bucket, 5 MB images, each person writes in their own folder.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback', 'feedback', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "feedback upload own" ON storage.objects;
CREATE POLICY "feedback upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "feedback read own or admin" ON storage.objects;
CREATE POLICY "feedback read own or admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'feedback' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_app_admin()));

-- ── 3. Account safety ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_status ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.account_status TO authenticated;
DROP POLICY IF EXISTS "Users see own status" ON public.account_status;
CREATE POLICY "Users see own status" ON public.account_status
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Written only by the admin functions below.

CREATE TABLE IF NOT EXISTS public.banned_identities (
  kind text NOT NULL CHECK (kind IN ('email', 'phone')),
  value text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, value)
);
ALTER TABLE public.banned_identities ENABLE ROW LEVEL SECURITY;
-- No policies: only the database itself and the admin functions use it.

CREATE OR REPLACE FUNCTION public.is_suspended(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.account_status WHERE user_id = _uid AND status = 'suspended');
$$;
REVOKE ALL ON FUNCTION public.is_suspended(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_suspended(uuid) TO authenticated, service_role;

-- Phone numbers are compared by their digits only.
CREATE OR REPLACE FUNCTION public.phone_digits(_p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(regexp_replace(coalesce(_p, ''), '\D', '', 'g'), '');
$$;

-- What the app asks after signing in and when it comes back to the screen.
CREATE OR REPLACE FUNCTION public.get_my_account_status()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_suspended(auth.uid()) THEN 'suspended' ELSE 'active' END;
$$;
REVOKE ALL ON FUNCTION public.get_my_account_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_status() TO authenticated;

-- Banned emails can't create a new account (covers email and Google sign-up).
CREATE OR REPLACE FUNCTION public.refuse_banned_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.banned_identities WHERE kind = 'email' AND value = lower(NEW.email)
  ) THEN
    RAISE EXCEPTION 'account_not_allowed' USING ERRCODE = 'P0001', HINT = 'chichat_banned';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS refuse_banned_signup ON auth.users;
CREATE TRIGGER refuse_banned_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.refuse_banned_signup();

-- Asked by the sign-up screen first, so a refused person gets a clear message.
CREATE OR REPLACE FUNCTION public.signup_allowed(_email text, _phone text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.banned_identities
    WHERE (kind = 'email' AND value = lower(trim(coalesce(_email, ''))))
       OR (kind = 'phone' AND value = public.phone_digits(_phone))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.signup_allowed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_allowed(text, text) TO anon, authenticated;

-- Banned phone numbers can't be put on any account.
CREATE OR REPLACE FUNCTION public.refuse_banned_phone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.phone_digits(NEW.phone) IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone)
     AND EXISTS (
       SELECT 1 FROM public.banned_identities
       WHERE kind = 'phone' AND value = public.phone_digits(NEW.phone)
         AND user_id IS DISTINCT FROM NEW.id
     ) THEN
    RAISE EXCEPTION 'phone_not_allowed' USING ERRCODE = 'P0001', HINT = 'chichat_banned';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_refuse_banned_phone ON public.profiles;
CREATE TRIGGER profiles_refuse_banned_phone
  BEFORE INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.refuse_banned_phone();

-- Limits. Change the numbers here if they turn out too tight or too loose.
--   New chats a person can open per day with people who haven't replied:
--   15 in the account's first 7 days, 40 after.
--   Calls a person can start per hour: 20 in the first 7 days, 60 after.
CREATE OR REPLACE FUNCTION public.account_is_new(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT created_at > now() - interval '7 days' FROM auth.users WHERE id = _uid), false);
$$;

CREATE INDEX IF NOT EXISTS messages_sender_created_idx ON public.messages (sender_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.refuse_message_when_limited()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_opened integer;
  v_max integer;
BEGIN
  IF public.is_suspended(NEW.sender_id) THEN
    RAISE EXCEPTION 'suspended' USING ERRCODE = 'P0001', HINT = 'chichat_suspended';
  END IF;
  -- Only the first message into a chat where the other person hasn't written yet counts.
  IF EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = NEW.conversation_id) THEN
    RETURN NEW;
  END IF;
  SELECT count(DISTINCT m.conversation_id) INTO v_opened
  FROM public.messages m
  WHERE m.sender_id = NEW.sender_id
    AND m.created_at > now() - interval '1 day'
    AND NOT EXISTS (
      SELECT 1 FROM public.messages o
      WHERE o.conversation_id = m.conversation_id AND o.sender_id <> NEW.sender_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.messages e
      WHERE e.conversation_id = m.conversation_id AND e.created_at <= now() - interval '1 day'
    );
  v_max := CASE WHEN public.account_is_new(NEW.sender_id) THEN 15 ELSE 40 END;
  IF v_opened >= v_max THEN
    RAISE EXCEPTION 'limit' USING ERRCODE = 'P0001', HINT = 'chichat_limit';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_refuse_when_limited ON public.messages;
CREATE TRIGGER messages_refuse_when_limited
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.refuse_message_when_limited();

CREATE OR REPLACE FUNCTION public.refuse_call_when_limited()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent integer;
  v_max integer;
BEGIN
  IF public.is_suspended(NEW.caller_id) THEN
    RAISE EXCEPTION 'suspended' USING ERRCODE = 'P0001', HINT = 'chichat_suspended';
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
DROP TRIGGER IF EXISTS calls_refuse_when_limited ON public.calls;
CREATE TRIGGER calls_refuse_when_limited
  BEFORE INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.refuse_call_when_limited();

-- ── Admin functions (each one checks the caller is an admin) ─────────────
CREATE OR REPLACE FUNCTION public.admin_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN jsonb_build_object(
    'users', (SELECT count(*) FROM auth.users),
    'new_users_7d', (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '7 days'),
    'suspended', (SELECT count(*) FROM public.account_status WHERE status = 'suspended'),
    'open_reports', (SELECT count(*) FROM public.reports WHERE status = 'open'),
    'new_feedback', (SELECT count(*) FROM public.feedback WHERE status = 'new'),
    'errors_24h', (SELECT coalesce(sum(times), 0) FROM public.app_errors WHERE last_seen_at > now() - interval '1 day'),
    'paid_minutes_today', (
      SELECT coalesce(round(sum(coalesce(duration_seconds, 0)) / 60.0, 1), 0)
      FROM public.outbound_calls WHERE started_at >= date_trunc('day', now())
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_find_users(_query text DEFAULT '', _limit int DEFAULT 50)
RETURNS TABLE (
  id uuid, email text, display_name text, phone text, created_at timestamptz,
  last_sign_in_at timestamptz, status text, status_reason text, reports_against bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q text := trim(coalesce(_query, ''));
  d text := public.phone_digits(_query);
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY
  SELECT u.id, u.email::text, p.display_name, p.phone, u.created_at, u.last_sign_in_at,
         coalesce(s.status, 'active'), s.reason,
         (SELECT count(*) FROM public.reports r WHERE r.reported_user_id = u.id)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.account_status s ON s.user_id = u.id
  WHERE q = ''
     OR u.email ILIKE '%' || q || '%'
     OR p.display_name ILIKE '%' || q || '%'
     OR (d IS NOT NULL AND length(d) >= 3 AND public.phone_digits(p.phone) LIKE '%' || d || '%')
     OR u.id::text = q
  ORDER BY u.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 50), 200));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(_user uuid, _reason text, _ban boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_phone text;
BEGIN
  PERFORM public.admin_guard();
  IF _user = auth.uid() THEN
    RAISE EXCEPTION 'cannot_suspend_self';
  END IF;
  INSERT INTO public.account_status (user_id, status, reason, changed_by, changed_at)
  VALUES (_user, 'suspended', left(_reason, 500), auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET status = 'suspended', reason = EXCLUDED.reason, changed_by = EXCLUDED.changed_by, changed_at = now();
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
  -- Sign them out everywhere (the app also signs out by itself when it checks).
  BEGIN
    DELETE FROM auth.sessions WHERE user_id = _user;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  UPDATE public.reports SET status = 'actioned' WHERE reported_user_id = _user AND status = 'open';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_user(_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  UPDATE public.account_status SET status = 'active', reason = NULL, changed_by = auth.uid(), changed_at = now()
  WHERE user_id = _user;
  DELETE FROM public.banned_identities WHERE user_id = _user;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_reports(_status text DEFAULT 'open', _limit int DEFAULT 100)
RETURNS TABLE (
  id uuid, created_at timestamptz, status text, reason text, details text, also_blocked boolean,
  message_snapshot jsonb, reporter_id uuid, reporter_name text, reporter_email text,
  reported_user_id uuid, reported_name text, reported_email text, reported_status text,
  reports_against bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY
  SELECT r.id, r.created_at, r.status, r.reason, r.details, r.also_blocked, r.message_snapshot,
         r.reporter_id, rp.display_name, ru.email::text,
         r.reported_user_id, dp.display_name, du.email::text,
         coalesce(s.status, 'active'),
         (SELECT count(*) FROM public.reports x WHERE x.reported_user_id = r.reported_user_id)
  FROM public.reports r
  LEFT JOIN public.profiles rp ON rp.id = r.reporter_id
  LEFT JOIN auth.users ru ON ru.id = r.reporter_id
  LEFT JOIN public.profiles dp ON dp.id = r.reported_user_id
  LEFT JOIN auth.users du ON du.id = r.reported_user_id
  LEFT JOIN public.account_status s ON s.user_id = r.reported_user_id
  WHERE _status IS NULL OR _status = '' OR r.status = _status
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 100), 500));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_report_status(_report uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  IF _status NOT IN ('open', 'reviewed', 'actioned') THEN
    RAISE EXCEPTION 'bad_status';
  END IF;
  UPDATE public.reports SET status = _status WHERE id = _report;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_call_minutes(_days int DEFAULT 1)
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
  GROUP BY o.user_id, p.display_name, u.email
  ORDER BY 5 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_errors(_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid, kind text, message text, stack text, url text, app_build text, platform text,
  user_agent text, language text, times integer, first_seen_at timestamptz, last_seen_at timestamptz,
  user_id uuid, user_email text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY
  SELECT e.id, e.kind, e.message, e.stack, e.url, e.app_build, e.platform, e.user_agent, e.language,
         e.times, e.first_seen_at, e.last_seen_at, e.user_id, u.email::text
  FROM public.app_errors e LEFT JOIN auth.users u ON u.id = e.user_id
  ORDER BY e.last_seen_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 100), 500));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_feedback(_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid, created_at timestamptz, status text, category text, message text, screenshot_path text,
  app_build text, platform text, device text, language text, page text,
  user_id uuid, display_name text, email text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  RETURN QUERY
  SELECT f.id, f.created_at, f.status, f.category, f.message, f.screenshot_path, f.app_build,
         f.platform, f.device, f.language, f.page, f.user_id, p.display_name, u.email::text
  FROM public.feedback f
  LEFT JOIN public.profiles p ON p.id = f.user_id
  LEFT JOIN auth.users u ON u.id = f.user_id
  ORDER BY f.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 100), 500));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_feedback_status(_feedback uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_guard();
  IF _status NOT IN ('new', 'seen', 'done') THEN
    RAISE EXCEPTION 'bad_status';
  END IF;
  UPDATE public.feedback SET status = _status WHERE id = _feedback;
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'admin_guard()', 'admin_overview()', 'admin_find_users(text, int)',
    'admin_suspend_user(uuid, text, boolean)', 'admin_restore_user(uuid)',
    'admin_list_reports(text, int)', 'admin_set_report_status(uuid, text)',
    'admin_call_minutes(int)', 'admin_list_errors(int)', 'admin_list_feedback(int)',
    'admin_set_feedback_status(uuid, text)', 'account_is_new(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- Check: should list the admin account (1 row). If it's empty, the email
-- above doesn't match the account; run the INSERT into app_admins again
-- with the right email.
SELECT a.user_id, u.email FROM public.app_admins a JOIN auth.users u ON u.id = a.user_id;

-- ── Undo ─────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS refuse_banned_signup ON auth.users;
-- DROP TRIGGER IF EXISTS profiles_refuse_banned_phone ON public.profiles;
-- DROP TRIGGER IF EXISTS messages_refuse_when_limited ON public.messages;
-- DROP TRIGGER IF EXISTS calls_refuse_when_limited ON public.calls;
-- DROP POLICY IF EXISTS "feedback upload own" ON storage.objects;
-- DROP POLICY IF EXISTS "feedback read own or admin" ON storage.objects;
-- DROP TABLE IF EXISTS public.feedback, public.app_errors, public.banned_identities,
--   public.account_status, public.app_admins;
-- (The functions can stay; without the tables and triggers they do nothing.)
