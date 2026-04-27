-- 1. Add phone to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone)
  WHERE phone IS NOT NULL;

-- 2. call_stats: per (caller, callee) frequency
CREATE TABLE IF NOT EXISTS public.call_stats (
  caller_id UUID NOT NULL,
  callee_id UUID NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0,
  last_called_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (caller_id, callee_id)
);

ALTER TABLE public.call_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own call stats"
  ON public.call_stats FOR SELECT
  TO authenticated
  USING (caller_id = auth.uid());

CREATE POLICY "Users insert own call stats"
  ON public.call_stats FOR INSERT
  TO authenticated
  WITH CHECK (caller_id = auth.uid());

CREATE POLICY "Users update own call stats"
  ON public.call_stats FOR UPDATE
  TO authenticated
  USING (caller_id = auth.uid())
  WITH CHECK (caller_id = auth.uid());

-- 3. invites: track who the user invited (by phone)
CREATE TABLE IF NOT EXISTS public.invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_id UUID NOT NULL,
  phone TEXT NOT NULL,
  contact_name TEXT,
  invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invites_inviter_idx ON public.invites (inviter_id);
CREATE UNIQUE INDEX IF NOT EXISTS invites_inviter_phone_unique
  ON public.invites (inviter_id, phone);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own invites"
  ON public.invites FOR SELECT
  TO authenticated
  USING (inviter_id = auth.uid());

CREATE POLICY "Users create own invites"
  ON public.invites FOR INSERT
  TO authenticated
  WITH CHECK (inviter_id = auth.uid());

-- 4. Trigger to bump call_stats when a call completes
CREATE OR REPLACE FUNCTION public.bump_call_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only count when call transitions to ended/answered and wasn't before
  IF NEW.status IN ('ended','answered','completed')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND OLD.status NOT IN ('ended','answered','completed') THEN
    INSERT INTO public.call_stats (caller_id, callee_id, call_count, last_called_at)
    VALUES (NEW.caller_id, NEW.callee_id, 1, now())
    ON CONFLICT (caller_id, callee_id)
    DO UPDATE SET
      call_count = public.call_stats.call_count + 1,
      last_called_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_call_stats ON public.calls;
CREATE TRIGGER trg_bump_call_stats
  AFTER UPDATE ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_call_stats();

-- 5. RPC for batched contact matching by phone
CREATE OR REPLACE FUNCTION public.match_contacts_by_phone(_phones TEXT[])
RETURNS TABLE (
  phone TEXT,
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.phone, p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.phone = ANY(_phones)
    AND p.id <> auth.uid();
$$;