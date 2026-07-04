-- Security hardening: the "Recipients can mark messages read" UPDATE policy
-- (added in 20260418014311_eb05ec83-...sql) only restricts USING to non-sender
-- participants, but its WITH CHECK clause is OR'd together with the sender's
-- own UPDATE policy by Postgres RLS. That means a non-sender participant's
-- UPDATE passes WITH CHECK via the recipient policy (which only re-checks
-- participancy, not which columns changed) and can silently rewrite content,
-- edited_at, or deleted_for_everyone on someone else's message.
--
-- Fix without touching either existing policy (avoids any risk of breaking
-- the currently-working read-receipt or sender-edit flows): add a trigger
-- that rejects any UPDATE from a non-sender unless the only changed columns
-- are read_at / delivered_at.

CREATE OR REPLACE FUNCTION public.enforce_message_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.sender_id IS DISTINCT FROM auth.uid() THEN
    IF NEW.content IS DISTINCT FROM OLD.content
       OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
       OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.deleted_for_everyone IS DISTINCT FROM OLD.deleted_for_everyone
       OR NEW.edited_at IS DISTINCT FROM OLD.edited_at
    THEN
      RAISE EXCEPTION 'Only the sender may modify message content, edits, or deletion state';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_update_scope ON public.messages;
CREATE TRIGGER messages_update_scope
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_message_update_scope();
