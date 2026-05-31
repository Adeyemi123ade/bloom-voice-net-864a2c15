
DO $$
DECLARE uid uuid := '529785c3-241b-406e-9b10-4eeb8ebfa93f';
        em text;
        conv uuid;
BEGIN
  SELECT lower(email) INTO em FROM auth.users WHERE id = uid;

  DELETE FROM public.chat_backups WHERE user_id = uid;
  DELETE FROM public.device_push_tokens WHERE user_id = uid;
  DELETE FROM public.google_oauth_tokens WHERE user_id = uid;
  DELETE FROM public.invites WHERE inviter_id = uid;
  DELETE FROM public.typing_indicators WHERE user_id = uid;
  DELETE FROM public.messages WHERE sender_id = uid;
  -- delete conversations where this user participated, plus orphan participants
  FOR conv IN SELECT conversation_id FROM public.conversation_participants WHERE user_id = uid LOOP
    DELETE FROM public.messages WHERE conversation_id = conv;
    DELETE FROM public.typing_indicators WHERE conversation_id = conv;
    DELETE FROM public.conversation_participants WHERE conversation_id = conv;
    DELETE FROM public.conversations WHERE id = conv;
  END LOOP;
  DELETE FROM public.call_stats WHERE caller_id = uid OR callee_id = uid;
  DELETE FROM public.calls WHERE caller_id = uid OR callee_id = uid;
  DELETE FROM public.user_devices WHERE user_id = uid;
  DELETE FROM public.device_login_challenges WHERE user_id = uid;
  IF em IS NOT NULL THEN
    DELETE FROM public.device_login_challenges WHERE email = em;
    DELETE FROM public.auth_otp_aliases WHERE email = em;
    DELETE FROM public.email_send_log WHERE recipient_email = em;
    DELETE FROM public.email_unsubscribe_tokens WHERE email = em;
    DELETE FROM public.suppressed_emails WHERE email = em;
    DELETE FROM public.deleted_accounts WHERE email = em;
    DELETE FROM public.google_signin_attempts WHERE intended_email = em OR google_email = em;
  END IF;
  DELETE FROM public.profiles WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
END $$;
