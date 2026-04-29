-- ============================================
-- 1. Google OAuth tokens (per-user)
-- ============================================
CREATE TABLE public.google_oauth_tokens (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  scope TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  google_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own google tokens"
  ON public.google_oauth_tokens FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own google tokens"
  ON public.google_oauth_tokens FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own google tokens"
  ON public.google_oauth_tokens FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own google tokens"
  ON public.google_oauth_tokens FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_google_oauth_tokens_updated_at
  BEFORE UPDATE ON public.google_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 2. Chat backups metadata (per-user, one row)
-- ============================================
CREATE TABLE public.chat_backups (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_backup_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  manifest_path TEXT NOT NULL,
  auto_backup_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own backup"
  ON public.chat_backups FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own backup"
  ON public.chat_backups FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own backup"
  ON public.chat_backups FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own backup"
  ON public.chat_backups FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_chat_backups_updated_at
  BEFORE UPDATE ON public.chat_backups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 3. Private storage bucket for backup media
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('backup-media', 'backup-media', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users read own backup media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own backup media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own backup media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own backup media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);