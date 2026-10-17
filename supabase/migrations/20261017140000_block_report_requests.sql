-- Block, report and message requests.
--
-- Blocking is enforced by the database, not only by the screen:
--   * nobody can send a message into a chat where either person has blocked
--     the other (trigger on messages);
--   * nobody can start a call between two people where either has blocked
--     the other (trigger on calls, which also covers start_call());
--   * a person you blocked can't load your profile (name, photo, online,
--     last seen), find you in search, or match you from their contacts.
-- Reports are stored here and emailed to the support inbox by the
-- submit-report function. accepted_chats remembers which message requests
-- (first messages from people not in your contacts) you accepted.
--
-- Apply: Supabase Dashboard > SQL Editor, paste this file, Run.
-- Undo: see the end of this file.

-- ── Blocks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS blocked_users_blocked_idx ON public.blocked_users (blocked_id);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own blocks" ON public.blocked_users;
CREATE POLICY "Users see own blocks" ON public.blocked_users
  FOR SELECT TO authenticated USING (blocker_id = auth.uid());
DROP POLICY IF EXISTS "Users block others" ON public.blocked_users;
CREATE POLICY "Users block others" ON public.blocked_users
  FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
DROP POLICY IF EXISTS "Users unblock" ON public.blocked_users;
CREATE POLICY "Users unblock" ON public.blocked_users
  FOR DELETE TO authenticated USING (blocker_id = auth.uid());

-- true when _blocker has blocked _blocked
CREATE OR REPLACE FUNCTION public.has_blocked(_blocker uuid, _blocked uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE blocker_id = _blocker AND blocked_id = _blocked
  );
$$;

-- true when either person has blocked the other
CREATE OR REPLACE FUNCTION public.is_block_between(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  );
$$;

-- No messages between blocked people.
CREATE OR REPLACE FUNCTION public.refuse_blocked_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id <> NEW.sender_id
      AND public.is_block_between(NEW.sender_id, cp.user_id)
  ) THEN
    RAISE EXCEPTION 'blocked' USING ERRCODE = 'P0001', HINT = 'chichat_blocked';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_refuse_blocked ON public.messages;
CREATE TRIGGER messages_refuse_blocked
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.refuse_blocked_message();

-- No calls between blocked people.
CREATE OR REPLACE FUNCTION public.refuse_blocked_call()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_block_between(NEW.caller_id, NEW.callee_id) THEN
    RAISE EXCEPTION 'blocked' USING ERRCODE = 'P0001', HINT = 'chichat_blocked';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS calls_refuse_blocked ON public.calls;
CREATE TRIGGER calls_refuse_blocked
  BEFORE INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.refuse_blocked_call();

-- A person you blocked can't see your profile row (photo, online, last seen).
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR NOT public.has_blocked(id, auth.uid()));

-- ...nor find you in search or through their contacts.
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
    AND NOT public.has_blocked(p.id, auth.uid())
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

CREATE OR REPLACE FUNCTION public.match_contacts_by_phone(_phones TEXT[])
RETURNS TABLE (phone TEXT, user_id UUID, display_name TEXT, avatar_url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.phone, p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.phone = ANY(_phones)
    AND p.id <> auth.uid()
    AND NOT public.has_blocked(p.id, auth.uid());
$$;

-- ── Reports ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id uuid,
  message_snapshot jsonb,
  reason text NOT NULL,
  details text,
  also_blocked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open',
  emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_reported_idx ON public.reports (reported_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports (status, created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own reports" ON public.reports;
CREATE POLICY "Users see own reports" ON public.reports
  FOR SELECT TO authenticated USING (reporter_id = auth.uid());
-- Written only by the submit-report function (service role).

-- ── Message requests ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accepted_chats (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);
ALTER TABLE public.accepted_chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own accepted chats" ON public.accepted_chats;
CREATE POLICY "Users see own accepted chats" ON public.accepted_chats
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users accept own chats" ON public.accepted_chats;
CREATE POLICY "Users accept own chats" ON public.accepted_chats
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_conversation_participant(conversation_id, auth.uid()));

-- ── Undo ─────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS messages_refuse_blocked ON public.messages;
-- DROP TRIGGER IF EXISTS calls_refuse_blocked ON public.calls;
-- DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
-- CREATE POLICY "Profiles viewable by authenticated" ON public.profiles
--   FOR SELECT TO authenticated USING (true);
-- (then re-run search_users / match_contacts_by_phone from
--  20260711080000 / 20260624100000, and drop the three new tables.)
