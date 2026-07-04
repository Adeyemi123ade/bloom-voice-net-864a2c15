-- Backfill profiles for any auth.users created before the profiles table /
-- on_auth_user_created trigger existed (added 20260418013542). Found via
-- live audit: the account created 2026-04-17 had no profiles row, breaking
-- contacts/conversations visibility for that user even though auth worked.
-- Idempotent and uses the same name-derivation logic as the trigger itself.

INSERT INTO public.profiles (id, display_name)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT DO NOTHING;
