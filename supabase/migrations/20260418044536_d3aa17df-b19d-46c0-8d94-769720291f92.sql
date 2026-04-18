-- Calls table for ringing/signaling
CREATE TABLE public.calls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL,
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  room_name text NOT NULL UNIQUE,
  call_type text NOT NULL CHECK (call_type IN ('voice','video')),
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','accepted','declined','ended','missed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX idx_calls_callee ON public.calls(callee_id, status);
CREATE INDEX idx_calls_conversation ON public.calls(conversation_id);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants view own calls"
ON public.calls FOR SELECT TO authenticated
USING (caller_id = auth.uid() OR callee_id = auth.uid());

CREATE POLICY "Caller creates call"
ON public.calls FOR INSERT TO authenticated
WITH CHECK (caller_id = auth.uid() AND is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Participants update call"
ON public.calls FOR UPDATE TO authenticated
USING (caller_id = auth.uid() OR callee_id = auth.uid())
WITH CHECK (caller_id = auth.uid() OR callee_id = auth.uid());

CREATE TRIGGER calls_set_updated_at
BEFORE UPDATE ON public.calls
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER TABLE public.calls REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;