-- Update handle_new_user to capture phone from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Backfill existing profiles with phone from auth metadata
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