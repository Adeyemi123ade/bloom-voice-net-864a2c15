CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Intentionally do NOT insert phone here. If the phone is already taken by
  -- another profile, the unique constraint would crash the auth.users insert
  -- and Supabase would return a useless "Database error saving new user".
  -- Instead the client UPDATEs profiles.phone after signup and handles the
  -- 23505 (unique_violation) with a clear "phone already registered" message.
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);
  RETURN NEW;
END;
$function$;