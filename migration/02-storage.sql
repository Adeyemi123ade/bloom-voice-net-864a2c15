-- ============================================================
-- Storage buckets + policies
-- Run AFTER 01-schema.sql in Supabase SQL Editor (pnpabtxvsrkrldpfmtaz)
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars', 'avatars', true),
  ('chat-media', 'chat-media', true),
  ('backup-media', 'backup-media', false),
  ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO NOTHING;

-- avatars: public read, user-owned writes
DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;
CREATE POLICY "Avatars public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "Avatars user upload" ON storage.objects;
CREATE POLICY "Avatars user upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Avatars user update" ON storage.objects;
CREATE POLICY "Avatars user update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Avatars user delete" ON storage.objects;
CREATE POLICY "Avatars user delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- chat-media: public read, authenticated upload
DROP POLICY IF EXISTS "Chat media public read" ON storage.objects;
CREATE POLICY "Chat media public read" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');
DROP POLICY IF EXISTS "Chat media authed upload" ON storage.objects;
CREATE POLICY "Chat media authed upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Chat media owner delete" ON storage.objects;
CREATE POLICY "Chat media owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- backup-media: private, owner-only
DROP POLICY IF EXISTS "Backup owner read" ON storage.objects;
CREATE POLICY "Backup owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Backup owner upload" ON storage.objects;
CREATE POLICY "Backup owner upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Backup owner delete" ON storage.objects;
CREATE POLICY "Backup owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- email-assets: public read, service role writes
DROP POLICY IF EXISTS "Email assets public read" ON storage.objects;
CREATE POLICY "Email assets public read" ON storage.objects FOR SELECT USING (bucket_id = 'email-assets');
