-- Make chat photos, voice notes, videos and documents private.
--
-- Before: the chat-media bucket was public and had a "public read" rule, so
-- anyone with a link (or anyone at all, through the storage list API) could
-- open every file without signing in.
-- After: only signed-in people who are in the chat can open a file. The app
-- already opens media through short-lived signed links (src/lib/signedMedia
-- .ts), which work for both the old public-style links stored in messages
-- and new ones, so old messages keep working.
--
-- Who can open a file at <uploader id>/<conversation id>/<file>:
--   1. the person who uploaded it;
--   2. anyone in that conversation;
--   3. anyone in a chat whose messages contain this file (forwarded or
--      pasted messages reuse the original file in another chat, and very
--      old uploads used a different folder layout).
-- Messages deleted for everyone no longer give access through rule 3.
--
-- Apply: Supabase Dashboard > SQL Editor, paste this file, Run.
-- Undo (makes media public again):
--   UPDATE storage.buckets SET public = true WHERE id = 'chat-media';
--   CREATE POLICY "chat-media public read" ON storage.objects FOR SELECT
--     USING (bucket_id = 'chat-media');

CREATE OR REPLACE FUNCTION public.can_read_chat_media(_name text, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[] := storage.foldername(_name);
  conv uuid;
BEGIN
  IF _user_id IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Uploader.
  IF parts[1] = _user_id::text THEN
    RETURN true;
  END IF;

  -- 2. Member of the chat the file was sent in.
  IF parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    conv := parts[2]::uuid;
    IF public.is_conversation_participant(conv, _user_id) THEN
      RETURN true;
    END IF;
  END IF;

  -- 3. The file appears in a message in one of this person's chats.
  RETURN EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.messages m ON m.conversation_id = cp.conversation_id
    WHERE cp.user_id = _user_id
      AND m.content LIKE '%' || _name || '%'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_chat_media(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_chat_media(text, uuid) TO authenticated;

UPDATE storage.buckets SET public = false WHERE id = 'chat-media';

DROP POLICY IF EXISTS "chat-media public read" ON storage.objects;
DROP POLICY IF EXISTS "chat-media chat members read" ON storage.objects;
CREATE POLICY "chat-media chat members read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media' AND public.can_read_chat_media(name, auth.uid()));
