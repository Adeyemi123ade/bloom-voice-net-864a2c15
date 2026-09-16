-- The live database has drifted from these migrations: public.messages and
-- public.typing_indicators were both declared WITH primary keys in
-- 20260418013542 / 20260418014311, but neither constraint actually exists in
-- the live project (confirmed live: PostgREST rejects `on_conflict=id` on
-- messages with 42P10 "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification", and returns no Location header on insert).
--
-- Supabase Realtime cannot build a record payload for a table with no primary
-- key: its walrus/apply_rls step needs identity columns to run the RLS check
-- against. Every INSERT/UPDATE on these tables was therefore delivered to
-- subscribers as an EMPTY payload carrying
--   errors: ["Error 400: Bad Request, no primary key"]
-- so ChatRoom's INSERT handler received a row with no id and no content and
-- appended an empty message bubble. That is the "messages don't arrive until I
-- refresh" bug: the event did arrive, but with nothing in it, and only a
-- manual refresh (a plain REST read, which needs no primary key) showed the
-- real text.
--
-- Adding the declared primary keys restores full realtime payloads. Both
-- statements are guarded so this is safe to re-run and a no-op on any
-- environment where the constraints already exist.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.messages ADD PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.typing_indicators'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.typing_indicators ADD PRIMARY KEY (conversation_id, user_id);
  END IF;
END $$;
