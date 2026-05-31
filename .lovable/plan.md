# Consolidate to One Backend (Lovable Cloud)

Goal: Eliminate the two-project split. Make `tlyqomftfabnpczxefkp` (Lovable Cloud) the **single source of truth**, retire `pnpabtxvsrkrldpfmtaz`. After this, Lovable tools can manage migrations, auth, logs, and edge functions directly — no more dashboard juggling.

## Why migrate TO Lovable Cloud (not the other way)

- Lovable can natively manage migrations, RLS, edge function deploys, auth config, and secrets.
- The `pnpabtxvsrkrldpfmtaz` project is opaque to Lovable tools (read-only via dashboard).
- All your edge functions (`supabase/functions/*`) and `config.toml` already target Lovable Cloud — they're deployed there, just unused by the app.
- Real user data on `pnpabtxvsrkrldpfmtaz` is minimal (1 confirmed account: `teshoade2020@gmail.com`).

## Migration Plan

### Phase 1 — Audit the old project (you do in Supabase dashboard)

In `pnpabtxvsrkrldpfmtaz`:
1. Export `auth.users` list (CSV: id, email, phone, created_at, raw_user_meta_data).
2. Export each public table that has rows: `profiles`, `conversations`, `messages`, `conversation_participants`, `calls`, `call_stats`, `invites`, `device_push_tokens`, `user_devices`, `google_oauth_tokens`, `chat_backups`.
3. Download Storage buckets (`avatars`, `chat-media`, `backup-media`, `email-assets`) if any objects exist.
4. Note Auth settings: providers enabled, redirect URLs, email templates, SMTP config.

Send me the CSV/JSON exports + storage dumps and I'll script the import into Lovable Cloud.

### Phase 2 — Prep Lovable Cloud (I do)

1. Verify Lovable Cloud schema matches (it already does — same tables exist per the schema dump).
2. Configure auth on Lovable Cloud:
   - Enable Google provider (using existing `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` secrets).
   - Add redirect URLs: `chichatapp.com`, `www.chichatapp.com`, `bloom-voice-net.lovable.app`, preview URL.
   - Confirm email templates (auth-email-hook is already deployed here).
3. Confirm Storage buckets exist with matching policies.

### Phase 3 — Import data (I do, via migrations + edge function)

1. Bulk-insert users into `auth.users` via service role (preserves UUIDs so FK references stay valid).
2. Insert public-schema rows in dependency order: profiles → conversations → participants → messages → calls → rest.
3. Upload storage objects to matching buckets (preserves paths).
4. **Passwords cannot be migrated** (hashes aren't exportable). Affected users must reset password on first login — we send a one-time recovery email. Google users are unaffected.

### Phase 4 — Cut over (1-line code change)

1. Edit `src/integrations/supabase/client.ts` — remove the hard-pin, read from env (`.env` already points at Lovable Cloud).
2. Republish.
3. Smoke test: login (email + Google), send message, place call.

### Phase 5 — Decommission

1. Update Google Cloud Console OAuth redirect URIs to remove `pnpabtxvsrkrldpfmtaz.supabase.co/auth/v1/callback`.
2. Pause/delete `pnpabtxvsrkrldpfmtaz` in Supabase dashboard (keep paused for 30 days as safety net).

## Technical Details

- **User ID preservation**: We insert with explicit `id` (UUID) into `auth.users` via `admin.createUser` so all `profiles.id`, `messages.sender_id`, `calls.caller_id` FKs remain valid without rewrites.
- **Password reset email**: Triggered in batch via `admin.generateLink({ type: 'recovery' })` post-import. Users see "We've upgraded our infrastructure — please set a new password" message.
- **Storage**: Copied object-by-object via signed URLs from old project → upload to new. Paths and ACLs preserved.
- **Secrets**: All already configured on Lovable Cloud — nothing to re-add.
- **Edge functions**: No code changes needed; they already run on Lovable Cloud.
- **Rollback**: Revert the one-line client.ts change. Old project stays paused, not deleted.

## What I need from you to start

1. ✅ Approval of this plan.
2. Exports from Phase 1 (or DB credentials / a short window where I can guide you through running export queries in the SQL editor).
3. Confirmation: "Yes, force a password reset for the affected users" — or list specific users to skip.

## Estimated effort

- Phase 1 (you): 15-30 min
- Phases 2-5 (me): 1-2 build iterations once exports are in hand.

Total downtime: ~5 min during cutover.
