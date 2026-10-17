-- One call at a time between two people, decided by the server.
--
-- 1. calls.last_active_at: refreshed every 20 s by the app while a call is
--    on. A call whose phones have all gone quiet for 90 s is over, even if
--    nobody pressed End (a phone died or lost signal for good).
-- 2. start_call(): saves a new call in one step, under a lock for the two
--    people, so repeated taps, two phones or both people calling at the same
--    moment can never create two calls. It returns:
--      {"result":"created"}                 the new call was saved
--      {"result":"existing","call":{...}}   a call between them is already
--                                           ringing or on (that one is used)
--      {"result":"busy"}                    the caller is on another call

ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_calls_live_caller ON public.calls(caller_id) WHERE status IN ('ringing', 'accepted');
CREATE INDEX IF NOT EXISTS idx_calls_live_callee ON public.calls(callee_id) WHERE status IN ('ringing', 'accepted');

CREATE OR REPLACE FUNCTION public.start_call(
  _id uuid,
  _conversation_id uuid,
  _callee_id uuid,
  _room_name text,
  _call_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _existing public.calls%ROWTYPE;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  IF _callee_id = _me THEN
    RAISE EXCEPTION 'cannot call yourself';
  END IF;
  -- Same rule as the insert policy: both people are in this conversation.
  IF NOT public.is_conversation_participant(_conversation_id, _me)
     OR NOT public.is_conversation_participant(_conversation_id, _callee_id) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- One start at a time for this pair of people (released at commit).
  PERFORM pg_advisory_xact_lock(
    hashtextextended(LEAST(_me::text, _callee_id::text) || ':' || GREATEST(_me::text, _callee_id::text), 0)
  );

  -- Close calls involving either person that were left open: still
  -- "ringing" a minute on (rings stop after 45 s), or "accepted" with no
  -- sign of life for 90 s. (Calls from app versions without the 20 s
  -- refresh have no last_active_at; those count as over after 4 hours.)
  UPDATE public.calls
     SET status = CASE WHEN status = 'ringing' THEN 'missed' ELSE 'ended' END,
         ended_at = now()
   WHERE (caller_id IN (_me, _callee_id) OR callee_id IN (_me, _callee_id))
     AND (
       (status = 'ringing' AND created_at < now() - interval '60 seconds')
       OR (status = 'accepted' AND last_active_at IS NOT NULL AND last_active_at < now() - interval '90 seconds')
       OR (status = 'accepted' AND last_active_at IS NULL AND created_at < now() - interval '4 hours')
     );

  -- Already a call between these two: use it, never a second one.
  SELECT * INTO _existing
    FROM public.calls
   WHERE status IN ('ringing', 'accepted')
     AND ((caller_id = _me AND callee_id = _callee_id) OR (caller_id = _callee_id AND callee_id = _me))
   ORDER BY created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('result', 'existing', 'call', to_jsonb(_existing));
  END IF;

  -- The caller is on (or calling) someone else: end that call first. The
  -- person being called may be on another call: they get call waiting.
  IF EXISTS (
    SELECT 1 FROM public.calls
     WHERE (status = 'accepted' AND (caller_id = _me OR callee_id = _me))
        OR (status = 'ringing' AND caller_id = _me)
  ) THEN
    RETURN jsonb_build_object('result', 'busy');
  END IF;

  INSERT INTO public.calls (id, conversation_id, caller_id, callee_id, room_name, call_type, last_active_at)
  VALUES (_id, _conversation_id, _me, _callee_id, _room_name, _call_type, now());
  RETURN jsonb_build_object('result', 'created');
END;
$$;

REVOKE ALL ON FUNCTION public.start_call(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_call(uuid, uuid, uuid, text, text) TO authenticated;
