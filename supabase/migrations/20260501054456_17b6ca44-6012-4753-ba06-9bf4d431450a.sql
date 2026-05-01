-- Trusted devices: which (user, device) pairs are allowed in without an email OTP
CREATE TABLE public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  device_label TEXT,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX idx_user_devices_device ON public.user_devices(device_id);
CREATE INDEX idx_user_devices_user ON public.user_devices(user_id);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own devices"
  ON public.user_devices FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own devices"
  ON public.user_devices FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own devices"
  ON public.user_devices FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own devices"
  ON public.user_devices FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Short-lived OTP challenges for new-device / device-takeover sign-ins
CREATE TABLE public.device_login_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  device_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('new_device', 'device_takeover')),
  attempts INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dlc_lookup ON public.device_login_challenges(user_id, device_id, consumed_at);

ALTER TABLE public.device_login_challenges ENABLE ROW LEVEL SECURITY;
-- No policies => only service_role (edge functions) can touch it.

-- Helper: check whether ANY OTHER user is currently bound to this device
CREATE OR REPLACE FUNCTION public.device_is_bound_to_other(_device_id TEXT, _user_id UUID)
RETURNS TABLE(other_user_id UUID, other_display_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ud.user_id, p.display_name
  FROM public.user_devices ud
  LEFT JOIN public.profiles p ON p.id = ud.user_id
  WHERE ud.device_id = _device_id AND ud.user_id <> _user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.device_is_bound_to_other(TEXT, UUID) TO authenticated, service_role;