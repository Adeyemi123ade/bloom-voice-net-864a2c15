-- Regression fix: 20260624100000_backfill_missing_policies_and_functions.sql
-- re-created handle_new_user() with a phone INSERT, copying the *old*
-- 20260430205200 body and (per its own comment) mistakenly believing that
-- was "the final correct logic". It wasn't — 20260531102206 had already
-- removed the phone insert specifically because it crashes signup:
--
--   INSERT INTO public.profiles (id, display_name, phone) VALUES (..., phone)
--
-- runs inside the same transaction as the auth.users insert (via the
-- on_auth_user_created trigger). If that phone number is already used by any
-- other profile, it hits profiles_phone_unique and the whole signup
-- transaction aborts. Supabase surfaces this as an opaque, unrecoverable
-- "Database error saving new user" on the client, instead of the friendly
-- "this phone number is already registered" message that Register.tsx is
-- actually built to show. That client code explicitly UPDATEs profiles.phone
-- itself right after signUp() succeeds specifically so it can catch a 23505
-- (unique_violation) and surface it properly — but it never gets the chance
-- if the trigger already crashed the transaction.
--
-- 20260624100000 reintroduced this exact, already-diagnosed-and-fixed bug.
-- This migration restores the phone-free version. Do not re-add phone to
-- this function — see comment above and in Register.tsx's post-signUp
-- profile update.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);
  RETURN NEW;
END;
$$;
