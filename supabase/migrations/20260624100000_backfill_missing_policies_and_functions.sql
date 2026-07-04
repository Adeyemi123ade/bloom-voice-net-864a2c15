-- Live audit found that although every table from the 18 prior migrations
-- existed in this database, almost none of their RLS policies, triggers,
-- helper functions, or realtime publication memberships were ever actually
-- applied (pg_policies was completely empty across all of public schema).
-- This migration re-creates everything that's missing, written idempotently
-- (DROP ... IF EXISTS before CREATE, IF NOT EXISTS on indexes) so it's safe
-- to run regardless of partial prior state. Bare CREATE TABLE statements are
-- intentionally omitted since the tables already exist.

-- ============================================================
-- From 20260418013542 (profiles / conversations / messages core)
-- ============================================================
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- handle_new_user is superseded by the 20260430205200 version below; defined
-- once there with the final correct logic.

DROP POLICY IF EXISTS "Participants view own conversations" ON public.conversations;
CREATE POLICY "Participants view own conversations" ON public.conversations
  FOR SELECT TO authenticated USING (public.is_conversation_participant(id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated create conversations" ON public.conversations;
CREATE POLICY "Authenticated create conversations" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "View participants of own conversations" ON public.conversation_participants;
CREATE POLICY "View participants of own conversations" ON public.conversation_participants
  FOR SELECT TO authenticated USING (public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Add self to conversation" ON public.conversation_participants;
CREATE POLICY "Add self to conversation" ON public.conversation_participants
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "View messages in own conversations" ON public.messages;
CREATE POLICY "View messages in own conversations" ON public.messages
  FOR SELECT TO authenticated USING (public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Send messages to own conversations" ON public.messages;
CREATE POLICY "Send messages to own conversations" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND public.is_conversation_participant(conversation_id, auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_participants_user ON public.conversation_participants(user_id);

CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS messages_bump_conversation ON public.messages;
CREATE TRIGGER messages_bump_conversation AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_last_message();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='profiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- ============================================================
-- From 20260418014311 (typing indicators / read receipts / avatars)
-- ============================================================
DROP POLICY IF EXISTS "View typing in own conversations" ON public.typing_indicators;
CREATE POLICY "View typing in own conversations"
ON public.typing_indicators FOR SELECT TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Insert own typing" ON public.typing_indicators;
CREATE POLICY "Insert own typing"
ON public.typing_indicators FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Update own typing" ON public.typing_indicators;
CREATE POLICY "Update own typing"
ON public.typing_indicators FOR UPDATE TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Delete own typing" ON public.typing_indicators;
CREATE POLICY "Delete own typing"
ON public.typing_indicators FOR DELETE TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Recipients can mark messages read" ON public.messages;
CREATE POLICY "Recipients can mark messages read"
ON public.messages FOR UPDATE TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()) AND sender_id <> auth.uid())
WITH CHECK (public.is_conversation_participant(conversation_id, auth.uid()));

ALTER TABLE public.typing_indicators REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='typing_indicators') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatars are publicly viewable" ON storage.objects;
CREATE POLICY "Avatars are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- From 20260418033659 (edit/delete messages, start_direct_conversation, chat-media)
-- ============================================================
DROP POLICY IF EXISTS "Senders can update own messages" ON public.messages;
CREATE POLICY "Senders can update own messages"
ON public.messages FOR UPDATE TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Senders can delete own messages" ON public.messages;
CREATE POLICY "Senders can delete own messages"
ON public.messages FOR DELETE TO authenticated
USING (sender_id = auth.uid());

CREATE OR REPLACE FUNCTION public.start_direct_conversation(_other_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_conv uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _other_user = v_me THEN
    RAISE EXCEPTION 'Cannot start a chat with yourself';
  END IF;

  SELECT cp1.conversation_id INTO v_conv
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = v_me AND cp2.user_id = _other_user
  LIMIT 1;

  IF v_conv IS NOT NULL THEN
    RETURN v_conv;
  END IF;

  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conv;
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conv, v_me), (v_conv, _other_user);

  RETURN v_conv;
END;
$$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chat-media public read" ON storage.objects;
CREATE POLICY "chat-media public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat-media users upload own" ON storage.objects;
CREATE POLICY "chat-media users upload own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "chat-media users update own" ON storage.objects;
CREATE POLICY "chat-media users update own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "chat-media users delete own" ON storage.objects;
CREATE POLICY "chat-media users delete own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- From 20260418044536 (calls table policies/trigger)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_calls_callee ON public.calls(callee_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_conversation ON public.calls(conversation_id);

DROP POLICY IF EXISTS "Participants view own calls" ON public.calls;
CREATE POLICY "Participants view own calls"
ON public.calls FOR SELECT TO authenticated
USING (caller_id = auth.uid() OR callee_id = auth.uid());

DROP POLICY IF EXISTS "Caller creates call" ON public.calls;
CREATE POLICY "Caller creates call"
ON public.calls FOR INSERT TO authenticated
WITH CHECK (caller_id = auth.uid() AND is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Participants update call" ON public.calls;
CREATE POLICY "Participants update call"
ON public.calls FOR UPDATE TO authenticated
USING (caller_id = auth.uid() OR callee_id = auth.uid())
WITH CHECK (caller_id = auth.uid() OR callee_id = auth.uid());

DROP TRIGGER IF EXISTS calls_set_updated_at ON public.calls;
CREATE TRIGGER calls_set_updated_at
BEFORE UPDATE ON public.calls
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.calls REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='calls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END $$;

-- ============================================================
-- From 20260427005057 (call_stats, invites, bump_call_stats, contact matching)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone) WHERE phone IS NOT NULL;

DROP POLICY IF EXISTS "Users view own call stats" ON public.call_stats;
CREATE POLICY "Users view own call stats"
  ON public.call_stats FOR SELECT TO authenticated
  USING (caller_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own call stats" ON public.call_stats;
CREATE POLICY "Users insert own call stats"
  ON public.call_stats FOR INSERT TO authenticated
  WITH CHECK (caller_id = auth.uid());

DROP POLICY IF EXISTS "Users update own call stats" ON public.call_stats;
CREATE POLICY "Users update own call stats"
  ON public.call_stats FOR UPDATE TO authenticated
  USING (caller_id = auth.uid())
  WITH CHECK (caller_id = auth.uid());

CREATE INDEX IF NOT EXISTS invites_inviter_idx ON public.invites (inviter_id);
CREATE UNIQUE INDEX IF NOT EXISTS invites_inviter_phone_unique
  ON public.invites (inviter_id, phone);

DROP POLICY IF EXISTS "Users view own invites" ON public.invites;
CREATE POLICY "Users view own invites"
  ON public.invites FOR SELECT TO authenticated
  USING (inviter_id = auth.uid());

DROP POLICY IF EXISTS "Users create own invites" ON public.invites;
CREATE POLICY "Users create own invites"
  ON public.invites FOR INSERT TO authenticated
  WITH CHECK (inviter_id = auth.uid());

CREATE OR REPLACE FUNCTION public.bump_call_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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
  FOR EACH ROW EXECUTE FUNCTION public.bump_call_stats();

CREATE OR REPLACE FUNCTION public.match_contacts_by_phone(_phones TEXT[])
RETURNS TABLE (phone TEXT, user_id UUID, display_name TEXT, avatar_url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.phone, p.id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.phone = ANY(_phones) AND p.id <> auth.uid();
$$;

-- ============================================================
-- From 20260427052441 (device_push_tokens)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user ON public.device_push_tokens(user_id);

DROP POLICY IF EXISTS "Users view own tokens" ON public.device_push_tokens;
CREATE POLICY "Users view own tokens"
  ON public.device_push_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own tokens" ON public.device_push_tokens;
CREATE POLICY "Users insert own tokens"
  ON public.device_push_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own tokens" ON public.device_push_tokens;
CREATE POLICY "Users update own tokens"
  ON public.device_push_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own tokens" ON public.device_push_tokens;
CREATE POLICY "Users delete own tokens"
  ON public.device_push_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- From 20260429134917 (google_oauth_tokens, chat_backups, backup-media bucket)
-- ============================================================
DROP POLICY IF EXISTS "Users view own google tokens" ON public.google_oauth_tokens;
CREATE POLICY "Users view own google tokens"
  ON public.google_oauth_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own google tokens" ON public.google_oauth_tokens;
CREATE POLICY "Users insert own google tokens"
  ON public.google_oauth_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own google tokens" ON public.google_oauth_tokens;
CREATE POLICY "Users update own google tokens"
  ON public.google_oauth_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own google tokens" ON public.google_oauth_tokens;
CREATE POLICY "Users delete own google tokens"
  ON public.google_oauth_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_google_oauth_tokens_updated_at ON public.google_oauth_tokens;
CREATE TRIGGER update_google_oauth_tokens_updated_at
  BEFORE UPDATE ON public.google_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Users view own backup" ON public.chat_backups;
CREATE POLICY "Users view own backup"
  ON public.chat_backups FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own backup" ON public.chat_backups;
CREATE POLICY "Users insert own backup"
  ON public.chat_backups FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own backup" ON public.chat_backups;
CREATE POLICY "Users update own backup"
  ON public.chat_backups FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own backup" ON public.chat_backups;
CREATE POLICY "Users delete own backup"
  ON public.chat_backups FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_chat_backups_updated_at ON public.chat_backups;
CREATE TRIGGER update_chat_backups_updated_at
  BEFORE UPDATE ON public.chat_backups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('backup-media', 'backup-media', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users read own backup media" ON storage.objects;
CREATE POLICY "Users read own backup media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users upload own backup media" ON storage.objects;
CREATE POLICY "Users upload own backup media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users update own backup media" ON storage.objects;
CREATE POLICY "Users update own backup media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own backup media" ON storage.objects;
CREATE POLICY "Users delete own backup media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'backup-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- From 20260430192711 (email-assets bucket)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read on email-assets" ON storage.objects;
CREATE POLICY "Public read on email-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'email-assets');

-- ============================================================
-- From 20260430205200 (handle_new_user final version + phone backfill)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO UPDATE
    SET phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

UPDATE public.profiles p
SET phone = NULLIF(u.raw_user_meta_data->>'phone', '')
FROM auth.users u
WHERE p.id = u.id
  AND (p.phone IS NULL OR p.phone = '')
  AND NULLIF(u.raw_user_meta_data->>'phone', '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p2
    WHERE p2.phone = NULLIF(u.raw_user_meta_data->>'phone', '')
      AND p2.id <> p.id
  );

-- ============================================================
-- From 20260430210953 (auth_otp_aliases helper function)
-- ============================================================
CREATE INDEX IF NOT EXISTS auth_otp_aliases_lookup_idx
  ON public.auth_otp_aliases (lower(email), email_type, short_code, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_otp_aliases_expires_at_idx
  ON public.auth_otp_aliases (expires_at);

CREATE OR REPLACE FUNCTION public.cleanup_expired_auth_otp_aliases()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.auth_otp_aliases WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON public.auth_otp_aliases FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_auth_otp_aliases() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- From 20260501054456 (user_devices, device_login_challenges policies/fn)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_devices_device ON public.user_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_user ON public.user_devices(user_id);

DROP POLICY IF EXISTS "Users view own devices" ON public.user_devices;
CREATE POLICY "Users view own devices"
  ON public.user_devices FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own devices" ON public.user_devices;
CREATE POLICY "Users insert own devices"
  ON public.user_devices FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own devices" ON public.user_devices;
CREATE POLICY "Users delete own devices"
  ON public.user_devices FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own devices" ON public.user_devices;
CREATE POLICY "Users update own devices"
  ON public.user_devices FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_dlc_lookup ON public.device_login_challenges(user_id, device_id, consumed_at);
-- device_login_challenges intentionally has no policies (service-role only).

CREATE OR REPLACE FUNCTION public.device_is_bound_to_other(_device_id TEXT, _user_id UUID)
RETURNS TABLE(other_user_id UUID, other_display_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ud.user_id, p.display_name
  FROM public.user_devices ud
  LEFT JOIN public.profiles p ON p.id = ud.user_id
  WHERE ud.device_id = _device_id AND ud.user_id <> _user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.device_is_bound_to_other(TEXT, UUID) TO authenticated, service_role;

-- ============================================================
-- From 20260501160349 (user_devices.platform index, deleted_accounts)
-- ============================================================
CREATE INDEX IF NOT EXISTS user_devices_user_platform_idx
  ON public.user_devices (user_id, platform);
CREATE INDEX IF NOT EXISTS deleted_accounts_email_idx
  ON public.deleted_accounts (email);
-- deleted_accounts intentionally has no policies (service-role only).

-- ============================================================
-- From 20260501172847 (google_signin_attempts)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_google_signin_attempts_intended_email_created
  ON public.google_signin_attempts (intended_email, created_at DESC);
-- google_signin_attempts intentionally has no policies (service-role only).

-- Note: the 20260418033659/074043 email-infra and backup-email migrations
-- were already written fully idempotently (DO blocks with exception
-- handlers, IF NOT EXISTS guards throughout) and are re-applied verbatim
-- via a separate companion migration rather than duplicated here.
