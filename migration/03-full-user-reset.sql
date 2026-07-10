-- ============================================================
-- FULL USER DATA RESET — chichatapp (project pnpabtxvsrkrldpfmtaz)
-- ============================================================
-- WHAT THIS DOES
-- Deletes every account and every trace of user-generated data from the
-- ONE Supabase project this app is hardcoded to talk to
-- (src/integrations/supabase/client.ts). After this runs, the phone
-- uniqueness constraint (profiles_phone_unique) has nothing left in it —
-- any phone number, including numbers used by old test accounts (and your
-- own account), can be registered fresh. There is no number left with any
-- special status. Every future signup is a first-time signup.
--
-- THIS IS IRREVERSIBLE. It deletes ALL accounts (including
-- teshoade2020@gmail.com), ALL conversations, messages, calls, contacts,
-- devices, and backups. There is no undo. If you want a safety net, export
-- the tables listed in .lovable/plan.md Phase 1 BEFORE running this.
--
-- HOW TO RUN
-- Supabase Dashboard → project pnpabtxvsrkrldpfmtaz → SQL Editor →
-- paste this whole file → Run. It is safe to re-run (idempotent — running
-- it twice just finds nothing left to delete the second time).
--
-- WHAT THIS DOES NOT DO
-- - Storage files (avatars, chat-media, backup-media buckets): these are
--   blob objects, not rows a DELETE can reach. Clear them separately via
--   Dashboard → Storage → select each bucket → Select all → Delete, or run
--   02-storage.sql's bucket setup again after emptying them.
-- - `suppressed_emails` is left untouched on purpose — it's a global email
--   bounce/complaint suppression list, not user data, and wiping it would
--   only reintroduce old deliverability problems.
-- ============================================================

begin;

-- Content / activity tables (children first, though none of these have
-- enforced FKs in this schema — CASCADE is harmless if a constraint exists,
-- a no-op if it doesn't).
truncate table
  public.typing_indicators,
  public.call_stats,
  public.calls,
  public.messages,
  public.conversation_participants,
  public.conversations,
  public.invites,
  public.device_push_tokens,
  public.user_devices,
  public.device_login_challenges,
  public.chat_backups,
  public.google_oauth_tokens,
  public.google_signin_attempts,
  public.auth_otp_aliases,
  public.deleted_accounts,
  public.email_send_log,
  public.email_unsubscribe_tokens
  cascade;

-- Identity tables last.
truncate table public.profiles cascade;

-- auth.users cascades to Supabase's own internal tables
-- (auth.identities, auth.sessions, auth.refresh_tokens, auth.mfa_factors, etc.)
delete from auth.users;

commit;

-- Verify — every count below should read 0.
select
  (select count(*) from auth.users)       as auth_users_left,
  (select count(*) from public.profiles)  as profiles_left,
  (select count(*) from public.messages)  as messages_left,
  (select count(*) from public.calls)     as calls_left;
