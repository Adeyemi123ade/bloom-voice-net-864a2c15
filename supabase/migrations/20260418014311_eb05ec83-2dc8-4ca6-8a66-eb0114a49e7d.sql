
-- Add read_at to messages for read receipts
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Typing indicator table
CREATE TABLE IF NOT EXISTS public.typing_indicators (
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View typing in own conversations"
ON public.typing_indicators FOR SELECT TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Insert own typing"
ON public.typing_indicators FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Update own typing"
ON public.typing_indicators FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Delete own typing"
ON public.typing_indicators FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Allow recipients to mark messages as read
CREATE POLICY "Recipients can mark messages read"
ON public.messages FOR UPDATE TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()) AND sender_id <> auth.uid())
WITH CHECK (public.is_conversation_participant(conversation_id, auth.uid()));

-- Realtime
ALTER TABLE public.typing_indicators REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;

-- Avatars storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatars are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
