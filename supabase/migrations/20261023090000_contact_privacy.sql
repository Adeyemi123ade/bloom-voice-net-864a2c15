-- Contact privacy: no more open directory of ChiChat users.
--
-- Why: testers could see people they don't know. Three doors were open:
--   1. search_users ("Start a new chat") returned up to 100 of ALL users when
--      the search box was empty, and anyone by name or by 3+ digits of their
--      phone number.
--   2. The profiles table rule let any signed-in person read every profile
--      row (name, photo, online, last seen) straight from the API, no app
--      needed.
--   3. resolve_email_for_phone and account_identifier_status could be called
--      without signing in: the first returns the email address for a phone
--      number, the second says whether an email or phone is registered.
--      Nothing in the app calls either one.
--   4. Phone numbers: the old column revoke on profiles.phone had no effect
--      (see step 2b), so any signed-in person could read the phone number
--      of every profile they could see, which until now was everyone.
--
-- After this file:
--   - search_users only finds people you already have a chat with.
--   - The app adds the people from your own contacts (phone book on Android,
--     numbers you saved with New Contact) on top, from the existing contact
--     match. match_contacts_by_phone is unchanged: it still answers only for
--     exact numbers you send it.
--   - A profile row is visible to: yourself, people you share a chat with,
--     people you blocked (Settings > Blocked shows them), and admins.
--     Someone who blocked you still can't see yours.
--   - Nobody but the owner can read phone or backup_email from the table.
--   - The two lookup functions can only be called by the server.
--
-- How to apply: Supabase Dashboard > SQL Editor, paste this file, Run.
-- Safe to run twice. No app rebuild needed.
--
-- How to undo (puts the open directory back):
--   DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
--   CREATE POLICY "Profiles viewable by authenticated" ON public.profiles
--     FOR SELECT TO authenticated
--     USING (id = auth.uid() OR NOT public.has_blocked(id, auth.uid()));
--   GRANT SELECT ON public.profiles TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.resolve_email_for_phone(text) TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.account_identifier_status(text, text) TO anon, authenticated;
--   Then re-run the search_users block from 20261017140000_block_report_requests.sql.
--   (shares_conversation can stay; nothing else depends on the old rules.)

-- 1. Helper: do these two people share a chat?
CREATE OR REPLACE FUNCTION public.shares_conversation(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants mine
    JOIN public.conversation_participants theirs
      ON theirs.conversation_id = mine.conversation_id
    WHERE mine.user_id = _a
      AND theirs.user_id = _b
  );
$$;
REVOKE ALL ON FUNCTION public.shares_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_conversation(uuid, uuid) TO authenticated, service_role;

-- 2. Profile rows: only people you are connected to.
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_app_admin(auth.uid())
    OR (
      NOT public.has_blocked(id, auth.uid())
      AND (
        public.shares_conversation(auth.uid(), id)
        OR public.has_blocked(auth.uid(), id)
      )
    )
  );

-- 2b. Phone numbers and backup emails: owner only (through get_my_profile_private).
--     20260607235751 revoked these two columns, but a column revoke does
--     nothing while the role still has SELECT on the whole table, which
--     Supabase grants by default. So phone numbers were readable by anyone
--     allowed to see the row (and sent along with live profile updates).
--     Swap the table grant for a grant on every other column.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name NOT IN ('phone', 'backup_email');
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', cols);
END $$;

-- 3. Start a new chat search: people you already have a chat with.
--    Name search as before. Number search needs at least 7 digits and matches
--    the whole number, typed with or without the country code or leading 0.
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
      regexp_replace(regexp_replace(coalesce(_query, ''), '\D', '', 'g'), '^0+', '') AS digits
  ),
  partners AS (
    SELECT DISTINCT theirs.user_id AS uid
    FROM public.conversation_participants mine
    JOIN public.conversation_participants theirs
      ON theirs.conversation_id = mine.conversation_id
    WHERE mine.user_id = auth.uid()
      AND theirs.user_id <> auth.uid()
  )
  SELECT p.id, p.display_name, p.avatar_url, p.is_online, p.last_seen_at, p.show_last_seen
  FROM public.profiles p
  JOIN partners ON partners.uid = p.id
  CROSS JOIN q
  WHERE auth.uid() IS NOT NULL
    AND NOT public.has_blocked(p.id, auth.uid())
    AND (
      q.raw = ''
      OR p.display_name ILIKE '%' || q.raw || '%'
      OR (
        length(q.digits) >= 7
        AND regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') LIKE '%' || q.digits
      )
    )
  ORDER BY
    CASE WHEN q.raw <> '' AND p.display_name ILIKE q.raw || '%' THEN 0 ELSE 1 END,
    p.display_name ASC NULLS LAST
  LIMIT GREATEST(1, LEAST(coalesce(_limit, 50), 100));
$$;
REVOKE ALL ON FUNCTION public.search_users(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_users(text, int) TO authenticated, service_role;

-- 4. Unused lookups that worked without signing in: server only.
DO $$
BEGIN
  IF to_regprocedure('public.resolve_email_for_phone(text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.resolve_email_for_phone(text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.resolve_email_for_phone(text) TO service_role';
  END IF;
  IF to_regprocedure('public.account_identifier_status(text, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.account_identifier_status(text, text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.account_identifier_status(text, text) TO service_role';
  END IF;
END $$;
