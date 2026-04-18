-- 1. Add columns for edit/delete
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS deleted_for_everyone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- 2. Allow senders to update their own messages (edit / soft-delete-for-everyone)
DROP POLICY IF EXISTS "Senders can update own messages" ON public.messages;
CREATE POLICY "Senders can update own messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

-- 3. Allow senders to delete their own messages (delete-for-me uses local hide; this is for hard delete by sender)
DROP POLICY IF EXISTS "Senders can delete own messages" ON public.messages;
CREATE POLICY "Senders can delete own messages"
ON public.messages
FOR DELETE
TO authenticated
USING (sender_id = auth.uid());

-- 4. RPC: atomically create or return a direct conversation
CREATE OR REPLACE FUNCTION public.start_direct_conversation(_other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_conv uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _other_user = v_me THEN
    RAISE EXCEPTION 'Cannot start a chat with yourself';
  END IF;

  -- find existing 1:1
  SELECT cp1.conversation_id INTO v_conv
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = v_me AND cp2.user_id = _other_user
  LIMIT 1;

  IF v_conv IS NOT NULL THEN
    RETURN v_conv;
  END IF;

  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conv;
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conv, v_me), (v_conv, _other_user);

  RETURN v_conv;
END;
$$;

-- 5. chat-media bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chat-media public read" ON storage.objects;
CREATE POLICY "chat-media public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat-media users upload own" ON storage.objects;
CREATE POLICY "chat-media users upload own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "chat-media users update own" ON storage.objects;
CREATE POLICY "chat-media users update own"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "chat-media users delete own" ON storage.objects;
CREATE POLICY "chat-media users delete own"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);