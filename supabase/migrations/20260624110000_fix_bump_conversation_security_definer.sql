-- bump_conversation_last_message updates public.conversations from a trigger
-- fired on message INSERT, but conversations has no UPDATE policy for
-- authenticated users (only SELECT/INSERT). Without SECURITY DEFINER, the
-- UPDATE silently affects zero rows under RLS, so last_message_at never
-- bumps. Match the pattern already used by bump_call_stats.
CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;
