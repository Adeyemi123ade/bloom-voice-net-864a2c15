-- Security audit fixes (2026-10-28).
--
-- 1. Attachment links: a message written by hand could carry a
--    "[file]javascript:…" link that ran code in ChiChat when tapped (the app
--    now refuses such links too). Attachments must point at ChiChat's own
--    file storage.
-- 2. Signed-out callers: by Postgres default every database function could
--    be called without signing in. Most refuse, but some answered (e.g.
--    "has X blocked Y"). Now only the two the signed-out screens need
--    (signup_allowed, log_app_error) are open; signed-in access is unchanged.
--    New functions follow the same rule.
-- 3. Chats are only created by start_direct_conversation; the rule letting
--    any signed-in person insert chat rows directly is removed.
-- 4. A saved phone number can't be blanked by writing to the table directly
--    (the Profile screen already refused).
-- 5. Profile photos: only image files up to 5 MB; the list of everyone's
--    photo files is no longer readable (photo links keep working); a photo
--    address must be ChiChat's own storage. Chat files: up to 25 MB, the
--    app's own limit.
--
-- How to apply: Supabase Dashboard > SQL Editor, paste this whole file, Run.
-- One transaction: all of it applies, or none of it. Safe to run twice.
--
-- How to undo (each part):
--   1. DROP TRIGGER messages_attachment_links ON public.messages;
--      DROP FUNCTION public.refuse_foreign_attachment();
--   2. GRANT EXECUTE ON FUNCTION <name>(<args>) TO anon;  (per function)
--      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   3. CREATE POLICY "Authenticated create conversations" ON public.conversations
--        FOR INSERT TO authenticated WITH CHECK (true);
--   4. DROP TRIGGER profiles_keep_phone ON public.profiles;
--      DROP FUNCTION public.refuse_phone_removal();
--   5. UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL
--        WHERE id IN ('avatars', 'chat-media');
--      CREATE POLICY "Avatars are publicly viewable" ON storage.objects
--        FOR SELECT USING (bucket_id = 'avatars');
--      DROP TRIGGER profiles_own_avatar ON public.profiles;
--      DROP FUNCTION public.refuse_foreign_avatar();

BEGIN;

-- ── 1. Attachments point at ChiChat's own storage ──────────────────────

CREATE OR REPLACE FUNCTION public.refuse_foreign_attachment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- People using the app only; the server's own work (backup restore) is
  -- not affected.
  IF coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF (NEW.content LIKE '[file]%' OR NEW.content LIKE '[voice]%')
     AND NEW.content !~ '^\[(file|voice)\]https://pnpabtxvsrkrldpfmtaz\.supabase\.co/storage/v1/object/(public|sign)/chat-media/' THEN
    RAISE EXCEPTION 'bad_attachment' USING ERRCODE = '22023', HINT = 'chichat_bad_attachment';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_foreign_attachment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_attachment_links ON public.messages;
CREATE TRIGGER messages_attachment_links
  BEFORE INSERT OR UPDATE OF content ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.refuse_foreign_attachment();

-- ── 2. Database functions: closed to signed-out callers ────────────────

DO $$
DECLARE
  r record;
  v_auth boolean;
  v_srv boolean;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      -- functions that belong to an extension are left as they are
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    v_auth := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_srv := has_function_privilege('service_role', r.oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    -- Whoever could call it before (signed in, or the server) still can.
    IF v_auth THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
    END IF;
    IF v_srv THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
    END IF;
    -- The two the sign-up and sign-in screens use before anyone is signed in.
    IF r.proname IN ('signup_allowed', 'log_app_error') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

-- Functions added later: signed-in users and the server, not signed-out callers.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- ── 3. Chats are created by start_direct_conversation only ─────────────

DROP POLICY IF EXISTS "Authenticated create conversations" ON public.conversations;

-- ── 4. A saved phone number can't be blanked ───────────────────────────

CREATE OR REPLACE FUNCTION public.refuse_phone_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated'
     AND OLD.phone IS NOT NULL AND NEW.phone IS NULL THEN
    RAISE EXCEPTION 'phone_required' USING ERRCODE = 'P0001', HINT = 'chichat_no_phone';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_phone_removal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_keep_phone ON public.profiles;
CREATE TRIGGER profiles_keep_phone
  BEFORE UPDATE OF phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.refuse_phone_removal();

-- ── 5. Uploads ─────────────────────────────────────────────────────────

UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
 WHERE id = 'avatars';

-- The app refuses files over 25 MB; the storage now does too.
UPDATE storage.buckets SET file_size_limit = 26214400 WHERE id = 'chat-media';

-- Photo links are public addresses and keep working without this rule; it
-- only let anyone list every person's photo file. Owners still read their
-- own (needed to replace a photo).
DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Users read own avatar" ON storage.objects;
CREATE POLICY "Users read own avatar"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- A new photo address must be ChiChat's own storage. Checked only when the
-- photo changes, so existing addresses (and every other profile update,
-- like online status) are untouched.
CREATE OR REPLACE FUNCTION public.refuse_foreign_avatar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated'
     AND NEW.avatar_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url)
     AND NEW.avatar_url NOT LIKE 'https://pnpabtxvsrkrldpfmtaz.supabase.co/storage/v1/object/public/avatars/%' THEN
    RAISE EXCEPTION 'bad_avatar' USING ERRCODE = '22023', HINT = 'chichat_bad_avatar';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refuse_foreign_avatar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_own_avatar ON public.profiles;
CREATE TRIGGER profiles_own_avatar
  BEFORE INSERT OR UPDATE OF avatar_url ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.refuse_foreign_avatar();

-- ── Record this migration ──────────────────────────────────────────────
INSERT INTO public.app_migrations (id) VALUES ('20261028200000')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Check, after running (should say 20261028200000, true, false, false):
--   select public.app_db_version(),
--          exists (select 1 from pg_trigger where tgname = 'messages_attachment_links'),
--          has_function_privilege('anon', 'public.has_blocked(uuid,uuid)', 'EXECUTE'),
--          exists (select 1 from pg_policies where policyname = 'Authenticated create conversations');
