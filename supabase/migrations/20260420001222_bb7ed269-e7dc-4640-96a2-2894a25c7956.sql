ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS show_last_seen boolean NOT NULL DEFAULT true;