CREATE OR REPLACE FUNCTION public.update_my_profile(_display_name text, _phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _phone IS NOT NULL AND _phone <> '' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE phone = _phone AND id <> v_uid
  ) THEN
    RAISE EXCEPTION 'phone_taken' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (v_uid, NULLIF(trim(coalesce(_display_name,'')), ''), NULLIF(_phone, ''))
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        phone = EXCLUDED.phone;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text) TO authenticated;