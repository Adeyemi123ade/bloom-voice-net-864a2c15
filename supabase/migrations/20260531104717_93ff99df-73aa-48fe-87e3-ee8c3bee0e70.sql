-- Safe public helper: only returns whether an email/phone exists, no profile details.
CREATE OR REPLACE FUNCTION public.account_identifier_status(_email text DEFAULT NULL, _phone text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(_email, '')));
  v_phone text := trim(coalesce(_phone, ''));
  v_email_exists boolean := false;
  v_phone_exists boolean := false;
BEGIN
  IF v_email <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email
    ) INTO v_email_exists;
  END IF;

  IF v_phone <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.phone = v_phone
    ) INTO v_phone_exists;
  END IF;

  RETURN jsonb_build_object(
    'email_exists', v_email_exists,
    'phone_exists', v_phone_exists
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.account_identifier_status(text, text) TO anon, authenticated, service_role;

-- Safe phone resolver for the sign-in function: returns only exact/ambiguous/not-found plus the linked email.
CREATE OR REPLACE FUNCTION public.resolve_email_for_phone(_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := trim(coalesce(_phone, ''));
  v_digits text := regexp_replace(v_phone, '\D', '', 'g');
  v_local text := regexp_replace(v_digits, '^0+', '');
  v_count integer := 0;
  v_email text;
BEGIN
  WITH matches AS (
    SELECT u.email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.phone IS NOT NULL
      AND (
        p.phone = v_phone
        OR regexp_replace(p.phone, '\D', '', 'g') = v_digits
        OR (v_local <> '' AND regexp_replace(p.phone, '\D', '', 'g') LIKE '%' || v_local)
      )
  )
  SELECT count(*), min(email) INTO v_count, v_email FROM matches;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_count > 1 THEN
    RETURN jsonb_build_object('status', 'ambiguous');
  END IF;
  RETURN jsonb_build_object('status', 'found', 'email', lower(v_email));
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_email_for_phone(text) TO anon, authenticated, service_role;