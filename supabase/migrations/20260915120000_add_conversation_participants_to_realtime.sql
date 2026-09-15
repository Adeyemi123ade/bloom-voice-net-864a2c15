-- conversation_participants was never added to the supabase_realtime
-- publication in any prior migration (confirmed live via privileged
-- inspection: absent from pg_publication_tables). MessageNotifier.tsx
-- subscribes to postgres_changes INSERT on this table, filtered by
-- user_id, specifically to detect "I was just added to a new
-- conversation" and refresh its cached conversation-id set — without
-- publication membership that listener can never fire. Idempotent, same
-- pattern as the other ALTER PUBLICATION blocks in this repo.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
  END IF;
END $$;
