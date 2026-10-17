-- Paid calls to real phone numbers: one row per call, used for the daily
-- minutes cap. Written only by the twilio-voice-twiml function (service
-- role); each person can read their own rows.
--
-- Apply: Supabase Dashboard > SQL Editor, paste this file, Run.
-- Undo:  DROP TABLE IF EXISTS public.outbound_calls;

CREATE TABLE IF NOT EXISTS public.outbound_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_number text NOT NULL,
  call_sid text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  max_seconds integer NOT NULL,
  duration_seconds integer,
  status text
);

CREATE INDEX IF NOT EXISTS outbound_calls_user_started_idx
  ON public.outbound_calls (user_id, started_at DESC);

ALTER TABLE public.outbound_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own outbound calls" ON public.outbound_calls;
CREATE POLICY "Users read own outbound calls"
  ON public.outbound_calls FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- No insert/update/delete policies: only the server (service role) writes.
