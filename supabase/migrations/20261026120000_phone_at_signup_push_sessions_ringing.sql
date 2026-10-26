-- Phone saved at sign-up, push only to signed-in phones, caller rings only
-- when the other phone does. (2026-10-26)
--
-- 1. Phone number at sign-up
--    Why: Register saved the phone with a profile update straight after
--    signUp(). Sign-up waits for the email code, so there was no session yet
--    and the update changed nothing (since 20261023090000 it is refused
--    outright). Accounts made with the form had no phone, so friends' phone
--    books never matched them and they showed with "Invite".
--    Now the sign-up itself saves the number, in the same transaction that
--    creates the account. A number that is badly formed, already used by
--    another profile or banned is simply left out (the account is still
--    created, as before); Register checks the number before sign-up anyway.
--    Accounts already affected get their sign-up number now, when it is free.
--
-- 2. Calls only ring signed-in phones
--    Why: a phone kept its push token after its account signed out in some
--    ways (Google return page, expired or removed session), so it still rang
--    for that account, and Answer led to the sign-in screen. A token could
--    also stay owned by the previous account, so the next account on the
--    phone couldn't save it and got no full-screen calls.
--    Now each token is saved with the sign-in (session) it belongs to, by
--    register_push_token(), which also takes the token over from any earlier
--    account in one statement. push_tokens_for_user() (server only) returns
--    only tokens whose sign-in still exists and deletes the rest.
--
-- 3. "Calling" until the other phone rings
--    Why: the caller heard ringing as soon as the call screen opened, before
--    the other phone had been reached.
--    Now the other phone reports it is ringing (mark_call_ringing); the
--    caller shows "Calling…" until calls.callee_ringing_at is set.
--
-- Before running: check nobody changed handle_new_user in the dashboard:
--   select pg_get_functiondef('public.handle_new_user'::regproc);
--   It should match 20260704150000_fix_handle_new_user_phone_regression.sql.
--
-- How to apply: Supabase Dashboard > SQL Editor, paste this whole file, Run.
-- It runs as one transaction: all of it applies, or none of it.
-- Safe to run twice. Then deploy send-call-push (it needs
-- push_tokens_for_user).
--
-- How to undo:
--   BEGIN;
--   -- 1. Back to the phone-free sign-up (the backfilled numbers can stay):
--   --    re-run the CREATE FUNCTION from 20260704150000_fix_handle_new_user_phone_regression.sql
--   -- 2.
--   DROP FUNCTION IF EXISTS public.push_tokens_for_user(uuid);
--   DROP FUNCTION IF EXISTS public.register_push_token(text, text);
--   ALTER TABLE public.device_push_tokens DROP COLUMN IF EXISTS session_id;
--   -- 3.
--   DROP FUNCTION IF EXISTS public.mark_call_ringing(uuid);
--   ALTER TABLE public.calls DROP COLUMN IF EXISTS callee_ringing_at;
--   COMMIT;
--   Then redeploy the previous send-call-push (it reads device_push_tokens directly).

BEGIN;

-- ── 1. Phone number at sign-up ─────────────────────────────────────────

-- A sign-up number we may save: +E.164, not banned, not used by anyone else.
CREATE OR REPLACE FUNCTION public.signup_phone_if_free(_phone text, _user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p
  FROM (SELECT nullif(trim(coalesce(_phone, '')), '') AS p) x
  WHERE p ~ '^\+[1-9][0-9]{6,14}$'
    AND NOT EXISTS (SELECT 1 FROM public.profiles o WHERE o.phone = x.p AND o.id <> _user)
    AND NOT EXISTS (
      SELECT 1 FROM public.banned_identities b
      WHERE b.kind = 'phone'
        AND b.value = public.phone_digits(x.p)
        AND b.user_id IS DISTINCT FROM _user
    );
$$;
REVOKE ALL ON FUNCTION public.signup_phone_if_free(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_phone_if_free(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  v_phone text := public.signup_phone_if_free(NEW.raw_user_meta_data->>'phone', NEW.id);
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, display_name, phone)
    VALUES (NEW.id, v_name, v_phone)
    ON CONFLICT (id) DO UPDATE
      SET display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
          phone = COALESCE(public.profiles.phone, EXCLUDED.phone);
  EXCEPTION WHEN unique_violation OR raise_exception THEN
    -- The number was taken (or banned) at the same moment: create the
    -- profile without it rather than failing the whole sign-up.
    INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, v_name)
    ON CONFLICT (id) DO UPDATE
      SET display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);
  END;
  RETURN NEW;
END;
$$;

-- Accounts made with the form before this file: give them the number they
-- signed up with, when it is still free. If two accounts gave the same
-- number, the earlier account gets it.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.id, u.raw_user_meta_data->>'phone' AS phone
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.phone IS NULL
      AND coalesce(u.raw_user_meta_data->>'phone', '') <> ''
    ORDER BY u.created_at
  LOOP
    UPDATE public.profiles
       SET phone = public.signup_phone_if_free(r.phone, r.id)
     WHERE id = r.id
       AND phone IS NULL
       AND public.signup_phone_if_free(r.phone, r.id) IS NOT NULL;
  END LOOP;
END $$;

-- ── 2. Calls only ring signed-in phones ────────────────────────────────

ALTER TABLE public.device_push_tokens ADD COLUMN IF NOT EXISTS session_id uuid;

-- Saves this phone's token for the signed-in person and their current
-- sign-in. The token belongs to the phone, so it moves from any earlier
-- account in the same statement.
CREATE OR REPLACE FUNCTION public.register_push_token(_token text, _platform text DEFAULT 'android')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF _token IS NULL OR length(_token) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'bad token' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.device_push_tokens (user_id, fcm_token, platform, last_seen_at, session_id)
  VALUES (v_me, _token, coalesce(nullif(_platform, ''), 'android'), now(), v_session)
  ON CONFLICT (fcm_token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        last_seen_at = EXCLUDED.last_seen_at,
        session_id = EXCLUDED.session_id;
END;
$$;
REVOKE ALL ON FUNCTION public.register_push_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO authenticated, service_role;

-- Server only (send-call-push): the tokens of phones still signed in to
-- this account. Tokens of signed-out phones are deleted here. Tokens saved
-- before this file (no session recorded) are kept only while the account
-- has some sign-in; the app re-saves its token with its session on open.
CREATE OR REPLACE FUNCTION public.push_tokens_for_user(_user uuid)
RETURNS TABLE (fcm_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM public.device_push_tokens t
  WHERE t.user_id = _user
    AND (
      (t.session_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = t.session_id AND s.user_id = _user))
      OR
      (t.session_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id = _user))
    );

  RETURN QUERY
  SELECT t.fcm_token FROM public.device_push_tokens t WHERE t.user_id = _user;
END;
$$;
REVOKE ALL ON FUNCTION public.push_tokens_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_tokens_for_user(uuid) TO service_role;

-- ── 3. "Calling" until the other phone rings ──────────────────────────

ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS callee_ringing_at timestamptz;

-- The callee's phone says it is ringing. Only the callee, only while the
-- call still rings, only the first time (repeats change nothing).
CREATE OR REPLACE FUNCTION public.mark_call_ringing(_call_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH done AS (
    UPDATE public.calls
       SET callee_ringing_at = now()
     WHERE id = _call_id
       AND callee_id = auth.uid()
       AND status = 'ringing'
       AND callee_ringing_at IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM done);
$$;
REVOKE ALL ON FUNCTION public.mark_call_ringing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_call_ringing(uuid) TO authenticated, service_role;

COMMIT;
