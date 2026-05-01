
ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web';

CREATE INDEX IF NOT EXISTS user_devices_user_platform_idx
  ON public.user_devices (user_id, platform);

CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deleted_accounts_email_idx
  ON public.deleted_accounts (email);

ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;
-- No policies: only service-role (backend) can read/write.
