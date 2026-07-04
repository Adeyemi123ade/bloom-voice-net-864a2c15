-- ============================================================
-- ChiChat schema migration → pnpabtxvsrkrldpfmtaz
-- Clean rerunnable version.
-- Realtime publication is intentionally NOT modified here because the
-- destination project already has those tables in supabase_realtime.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  display_name text,
  avatar_url text,
  phone text UNIQUE,
  backup_email text,
  is_online boolean NOT NULL DEFAULT false,
  show_last_seen boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT ON public.conversation_participants TO authenticated;
GRANT ALL ON public.conversation_participants TO service_role;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  edited_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  deleted_for_everyone boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  room_name text NOT NULL,
  call_type text NOT NULL,
  status text NOT NULL DEFAULT 'ringing',
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.call_stats (
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  call_count integer NOT NULL DEFAULT 0,
  last_called_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (caller_id, callee_id)
);
GRANT SELECT, INSERT, UPDATE ON public.call_stats TO authenticated;
GRANT ALL ON public.call_stats TO service_role;
ALTER TABLE public.call_stats ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.typing_indicators (
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.typing_indicators TO authenticated;
GRANT ALL ON public.typing_indicators TO service_role;
ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL,
  phone text NOT NULL,
  contact_name text,
  invited_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fcm_token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fcm_token)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_push_tokens TO authenticated;
GRANT ALL ON public.device_push_tokens TO service_role;
ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  device_label text,
  platform text NOT NULL DEFAULT 'web',
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  user_id uuid PRIMARY KEY,
  google_email text,
  access_token text NOT NULL,
  refresh_token text,
  scope text,
  token_type text DEFAULT 'Bearer',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_oauth_tokens TO authenticated;
GRANT ALL ON public.google_oauth_tokens TO service_role;
ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.google_signin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intended_email text NOT NULL,
  google_email text NOT NULL,
  matched boolean NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.google_signin_attempts TO service_role;
ALTER TABLE public.google_signin_attempts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chat_backups (
  user_id uuid PRIMARY KEY,
  auto_backup_enabled boolean NOT NULL DEFAULT true,
  last_backup_at timestamptz NOT NULL DEFAULT now(),
  message_count integer NOT NULL DEFAULT 0,
  media_count integer NOT NULL DEFAULT 0,
  total_bytes bigint NOT NULL DEFAULT 0,
  manifest_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_backups TO authenticated;
GRANT ALL ON public.chat_backups TO service_role;
ALTER TABLE public.chat_backups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.auth_otp_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_type text NOT NULL,
  short_code text NOT NULL,
  full_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_otp_aliases_lookup ON public.auth_otp_aliases (email, email_type, short_code);
GRANT ALL ON public.auth_otp_aliases TO service_role;
ALTER TABLE public.auth_otp_aliases ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.device_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  device_id text NOT NULL,
  reason text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.device_login_challenges TO service_role;
ALTER TABLE public.device_login_challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.deleted_accounts TO service_role;
ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text,
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL,
  error_message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_send_log TO service_role;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.email_send_state (
  id integer PRIMARY KEY DEFAULT 1,
  retry_after_until timestamptz,
  batch_size integer NOT NULL DEFAULT 10,
  send_delay_ms integer NOT NULL DEFAULT 200,
  auth_email_ttl_minutes integer NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes integer NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT ALL ON public.email_send_state TO service_role;
ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_unsubscribe_tokens TO service_role;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  reason text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.suppressed_emails TO service_role;
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO UPDATE SET display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.bump_call_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IN ('ended','answered','completed')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND OLD.status NOT IN ('ended','answered','completed') THEN
    INSERT INTO public.call_stats (caller_id, callee_id, call_count, last_called_at)
    VALUES (NEW.caller_id, NEW.callee_id, 1, now())
    ON CONFLICT (caller_id, callee_id)
    DO UPDATE SET call_count = public.call_stats.call_count + 1, last_called_at = now();
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.start_direct_conversation(_other_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me uuid := auth.uid(); v_conv uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _other_user = v_me THEN RAISE EXCEPTION 'Cannot start a chat with yourself'; END IF;
  SELECT cp1.conversation_id INTO v_conv FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = v_me AND cp2.user_id = _other_user LIMIT 1;
  IF v_conv IS NOT NULL THEN RETURN v_conv; END IF;
  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conv;
  INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv, v_me), (v_conv, _other_user);
  RETURN v_conv;
END; $$;

CREATE OR REPLACE FUNCTION public.match_contacts_by_phone(_phones text[])
RETURNS TABLE(phone text, user_id uuid, display_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.phone, p.id, p.display_name, p.avatar_url FROM public.profiles p
    WHERE p.phone = ANY(_phones) AND p.id <> auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.account_identifier_status(_email text DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text := lower(trim(coalesce(_email, ''))); v_phone text := trim(coalesce(_phone, ''));
  v_email_exists boolean := false; v_phone_exists boolean := false;
BEGIN
  IF v_email <> '' THEN SELECT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email) INTO v_email_exists; END IF;
  IF v_phone <> '' THEN SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.phone = v_phone) INTO v_phone_exists; END IF;
  RETURN jsonb_build_object('email_exists', v_email_exists, 'phone_exists', v_phone_exists);
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_email_for_phone(_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_phone text := trim(coalesce(_phone, ''));
  v_digits text := regexp_replace(v_phone, '\D', '', 'g');
  v_local text := regexp_replace(v_digits, '^0+', '');
  v_count integer := 0; v_email text;
BEGIN
  WITH matches AS (
    SELECT u.email FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.phone IS NOT NULL AND (
      p.phone = v_phone OR regexp_replace(p.phone, '\D', '', 'g') = v_digits
      OR (v_local <> '' AND regexp_replace(p.phone, '\D', '', 'g') LIKE '%' || v_local)))
  SELECT count(*), min(email) INTO v_count, v_email FROM matches;
  IF v_count = 0 THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_count > 1 THEN RETURN jsonb_build_object('status', 'ambiguous'); END IF;
  RETURN jsonb_build_object('status', 'found', 'email', lower(v_email));
END; $$;

CREATE OR REPLACE FUNCTION public.find_user_by_backup_email(_backup_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM public.profiles WHERE backup_email = lower(trim(_backup_email)) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.validate_backup_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_primary_email text;
BEGIN
  IF NEW.backup_email IS NULL THEN RETURN NEW; END IF;
  NEW.backup_email := lower(trim(NEW.backup_email));
  IF NEW.backup_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid backup email format'; END IF;
  SELECT lower(email) INTO v_primary_email FROM auth.users WHERE id = NEW.id;
  IF v_primary_email IS NOT NULL AND v_primary_email = NEW.backup_email THEN
    RAISE EXCEPTION 'Backup email must be different from your primary email';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_auth_otp_aliases()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM public.auth_otp_aliases WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END; $$;

CREATE OR REPLACE FUNCTION public.device_is_bound_to_other(_device_id text, _user_id uuid)
RETURNS TABLE(other_user_id uuid, other_display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT ud.user_id, p.display_name FROM public.user_devices ud
    LEFT JOIN public.profiles p ON p.id = ud.user_id
    WHERE ud.device_id = _device_id AND ud.user_id <> _user_id LIMIT 1;
$$;

-- pgmq wrappers
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN PERFORM pgmq.create(queue_name); RETURN pgmq.send(queue_name, payload);
END; $$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN PERFORM pgmq.create(queue_name); RETURN;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN RETURN FALSE;
END; $$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id); RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN PERFORM pgmq.create(dlq_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN PERFORM pgmq.delete(source_queue, message_id); EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN new_id;
END; $$;

-- ============================================================
-- TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS profiles_validate_backup_email ON public.profiles;
CREATE TRIGGER profiles_validate_backup_email BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_backup_email();

DROP TRIGGER IF EXISTS messages_bump_conversation ON public.messages;
CREATE TRIGGER messages_bump_conversation AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_last_message();

DROP TRIGGER IF EXISTS calls_updated_at ON public.calls;
CREATE TRIGGER calls_updated_at BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS calls_bump_stats ON public.calls;
CREATE TRIGGER calls_bump_stats AFTER UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.bump_call_stats();

DROP TRIGGER IF EXISTS chat_backups_updated_at ON public.chat_backups;
CREATE TRIGGER chat_backups_updated_at BEFORE UPDATE ON public.chat_backups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS google_oauth_tokens_updated_at ON public.google_oauth_tokens;
CREATE TRIGGER google_oauth_tokens_updated_at BEFORE UPDATE ON public.google_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auth user → profile bootstrap
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- profiles
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- conversations
DROP POLICY IF EXISTS "Participants view own conversations" ON public.conversations;
CREATE POLICY "Participants view own conversations" ON public.conversations FOR SELECT TO authenticated
  USING (is_conversation_participant(id, auth.uid()));
DROP POLICY IF EXISTS "Authenticated create conversations" ON public.conversations;
CREATE POLICY "Authenticated create conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);

-- conversation_participants
DROP POLICY IF EXISTS "View participants of own conversations" ON public.conversation_participants;
CREATE POLICY "View participants of own conversations" ON public.conversation_participants FOR SELECT TO authenticated
  USING (is_conversation_participant(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "Add self to conversation" ON public.conversation_participants;
CREATE POLICY "Add self to conversation" ON public.conversation_participants FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()) OR is_conversation_participant(conversation_id, auth.uid()));

-- messages
DROP POLICY IF EXISTS "View messages in own conversations" ON public.messages;
CREATE POLICY "View messages in own conversations" ON public.messages FOR SELECT TO authenticated
  USING (is_conversation_participant(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "Send messages to own conversations" ON public.messages;
CREATE POLICY "Send messages to own conversations" ON public.messages FOR INSERT TO authenticated
  WITH CHECK ((sender_id = auth.uid()) AND is_conversation_participant(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "Recipients can mark messages read" ON public.messages;
CREATE POLICY "Recipients can mark messages read" ON public.messages FOR UPDATE TO authenticated
  USING (is_conversation_participant(conversation_id, auth.uid()) AND sender_id <> auth.uid())
  WITH CHECK (is_conversation_participant(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "Senders can update own messages" ON public.messages;
CREATE POLICY "Senders can update own messages" ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());
DROP POLICY IF EXISTS "Senders can delete own messages" ON public.messages;
CREATE POLICY "Senders can delete own messages" ON public.messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- calls
DROP POLICY IF EXISTS "Participants view own calls" ON public.calls;
CREATE POLICY "Participants view own calls" ON public.calls FOR SELECT TO authenticated
  USING (caller_id = auth.uid() OR callee_id = auth.uid());
DROP POLICY IF EXISTS "Caller creates call" ON public.calls;
CREATE POLICY "Caller creates call" ON public.calls FOR INSERT TO authenticated
  WITH CHECK (caller_id = auth.uid() AND is_conversation_participant(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "Participants update call" ON public.calls;
CREATE POLICY "Participants update call" ON public.calls FOR UPDATE TO authenticated
  USING (caller_id = auth.uid() OR callee_id = auth.uid())
  WITH CHECK (caller_id = auth.uid() OR callee_id = auth.uid());

-- call_stats
DROP POLICY IF EXISTS "Users view own call stats" ON public.call_stats;
CREATE POLICY "Users view own call stats" ON public.call_stats FOR SELECT TO authenticated USING (caller_id = auth.uid());
DROP POLICY IF EXISTS "Users insert own call stats" ON public.call_stats;
CREATE POLICY "Users insert own call stats" ON public.call_stats FOR INSERT TO authenticated WITH CHECK (caller_id = auth.uid());
DROP POLICY IF EXISTS "Users update own call stats" ON public.call_stats;
CREATE POLICY "Users update own call stats" ON public.call_stats FOR UPDATE TO authenticated USING (caller_id = auth.uid()) WITH CHECK (caller_id = auth.uid());

-- typing_indicators
DROP POLICY IF EXISTS "View typing in own conversations" ON public.typing_indicators;
CREATE POLICY "View typing in own conversations" ON public.typing_indicators FOR SELECT TO authenticated USING (is_conversation_participant(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "Insert own typing" ON public.typing_indicators;
CREATE POLICY "Insert own typing" ON public.typing_indicators FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND is_conversation_participant(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "Update own typing" ON public.typing_indicators;
CREATE POLICY "Update own typing" ON public.typing_indicators FOR UPDATE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Delete own typing" ON public.typing_indicators;
CREATE POLICY "Delete own typing" ON public.typing_indicators FOR DELETE TO authenticated USING (user_id = auth.uid());

-- invites
DROP POLICY IF EXISTS "Users view own invites" ON public.invites;
CREATE POLICY "Users view own invites" ON public.invites FOR SELECT TO authenticated USING (inviter_id = auth.uid());
DROP POLICY IF EXISTS "Users create own invites" ON public.invites;
CREATE POLICY "Users create own invites" ON public.invites FOR INSERT TO authenticated WITH CHECK (inviter_id = auth.uid());

-- device_push_tokens
DROP POLICY IF EXISTS "Users view own tokens" ON public.device_push_tokens;
CREATE POLICY "Users view own tokens" ON public.device_push_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users insert own tokens" ON public.device_push_tokens;
CREATE POLICY "Users insert own tokens" ON public.device_push_tokens FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update own tokens" ON public.device_push_tokens;
CREATE POLICY "Users update own tokens" ON public.device_push_tokens FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users delete own tokens" ON public.device_push_tokens;
CREATE POLICY "Users delete own tokens" ON public.device_push_tokens FOR DELETE TO authenticated USING (user_id = auth.uid());

-- user_devices
DROP POLICY IF EXISTS "Users view own devices" ON public.user_devices;
CREATE POLICY "Users view own devices" ON public.user_devices FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users insert own devices" ON public.user_devices;
CREATE POLICY "Users insert own devices" ON public.user_devices FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update own devices" ON public.user_devices;
CREATE POLICY "Users update own devices" ON public.user_devices FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users delete own devices" ON public.user_devices;
CREATE POLICY "Users delete own devices" ON public.user_devices FOR DELETE TO authenticated USING (user_id = auth.uid());

-- google_oauth_tokens
DROP POLICY IF EXISTS "Users view own google tokens" ON public.google_oauth_tokens;
CREATE POLICY "Users view own google tokens" ON public.google_oauth_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users insert own google tokens" ON public.google_oauth_tokens;
CREATE POLICY "Users insert own google tokens" ON public.google_oauth_tokens FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update own google tokens" ON public.google_oauth_tokens;
CREATE POLICY "Users update own google tokens" ON public.google_oauth_tokens FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users delete own google tokens" ON public.google_oauth_tokens;
CREATE POLICY "Users delete own google tokens" ON public.google_oauth_tokens FOR DELETE TO authenticated USING (user_id = auth.uid());

-- chat_backups
DROP POLICY IF EXISTS "Users view own backup" ON public.chat_backups;
CREATE POLICY "Users view own backup" ON public.chat_backups FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users insert own backup" ON public.chat_backups;
CREATE POLICY "Users insert own backup" ON public.chat_backups FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update own backup" ON public.chat_backups;
CREATE POLICY "Users update own backup" ON public.chat_backups FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users delete own backup" ON public.chat_backups;
CREATE POLICY "Users delete own backup" ON public.chat_backups FOR DELETE TO authenticated USING (user_id = auth.uid());

-- email_send_log / state / tokens / suppressed: service_role only (already enforced by no policies + RLS)
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
CREATE POLICY "Service role can read send log" ON public.email_send_log FOR SELECT USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
CREATE POLICY "Service role can insert send log" ON public.email_send_log FOR INSERT WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can update send log" ON public.email_send_log FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state" ON public.email_send_state FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens FOR SELECT USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens FOR INSERT WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails FOR SELECT USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- REALTIME
-- ============================================================
-- Skipped on purpose. Do not add ALTER PUBLICATION statements here.
