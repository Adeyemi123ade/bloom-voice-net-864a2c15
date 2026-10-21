-- Chat backups: only the server writes them.
--
-- Why: the old rules let a signed-in user overwrite their own backup file in
-- backup-media and change manifest_path in chat_backups. chat-restore trusted
-- both. The functions are fixed on their own (signed backups, fixed path,
-- restore only into chats you are in), and this closes the doors too.
--
-- What the app still needs: read its own chat_backups row (Settings > Chat
-- backup) and switch auto backup on or off. Both stay allowed.
-- chat-backup, chat-restore and delete-account use the service role, which
-- these rules don't limit.
--
-- How to apply: Supabase Dashboard > SQL Editor, paste this file, Run.
-- Safe to run twice.
--
-- How to undo (puts the old, unsafe rules back):
--   CREATE POLICY "Users upload own backup media" ON storage.objects FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);
--   CREATE POLICY "Users update own backup media" ON storage.objects FOR UPDATE TO authenticated
--     USING (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);
--   CREATE POLICY "Users delete own backup media" ON storage.objects FOR DELETE TO authenticated
--     USING (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);
--   CREATE POLICY "Users insert own backup" ON public.chat_backups FOR INSERT TO authenticated
--     WITH CHECK (user_id = auth.uid());
--   CREATE POLICY "Users delete own backup" ON public.chat_backups FOR DELETE TO authenticated
--     USING (user_id = auth.uid());
--   GRANT INSERT, UPDATE, DELETE ON public.chat_backups TO authenticated;

-- 1. backup-media: users may still read their own folder, nothing else.
DROP POLICY IF EXISTS "Users upload own backup media" ON storage.objects;
DROP POLICY IF EXISTS "Users update own backup media" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own backup media" ON storage.objects;

-- 2. chat_backups: users read their row and change only auto_backup_enabled.
DROP POLICY IF EXISTS "Users insert own backup" ON public.chat_backups;
DROP POLICY IF EXISTS "Users delete own backup" ON public.chat_backups;
REVOKE INSERT, UPDATE, DELETE ON public.chat_backups FROM authenticated, anon;
GRANT SELECT ON public.chat_backups TO authenticated;
GRANT UPDATE (auto_backup_enabled) ON public.chat_backups TO authenticated;

-- Check after running (expected: only "Users read own backup media" for backup-media):
--   select policyname, cmd from pg_policies
--   where schemaname = 'storage' and tablename = 'objects' and policyname ilike '%backup%';
