# Secrets & Edge Function Configuration Reference

This is a **names-only inventory** — it documents which secret/env var each
edge function needs and where that value must be configured. It never
contains actual secret values. Real values live only in:

- **Supabase Dashboard** → Project Settings → Edge Functions → Secrets
  (`https://supabase.com/dashboard/project/pnpabtxvsrkrldpfmtaz/settings/functions`)
- **Supabase Vault** (`vault.secrets`, SQL-only access) for the one secret
  a database cron job needs directly (see "Vault secrets" below).

Never commit real key/token values to this repo, to commit messages, or to
chat. If a credential is ever pasted into a chat/PR/issue, treat it as
compromised and rotate it immediately (GitHub: Settings → Developer settings
→ Personal access tokens; Supabase: Account → Access Tokens).

## Global secrets (used by most/all functions)

| Secret | Used for |
|---|---|
| `SUPABASE_URL` | Supabase project URL, auto-injected by the platform |
| `SUPABASE_ANON_KEY` | Anon/public key, auto-injected — safe to expose client-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for admin-level DB/auth operations — **never** expose this client-side |

## Per-function secrets

| Function | Purpose | Auth (`verify_jwt`) | Extra secrets used |
|---|---|---|---|
| `auth-email-hook` | Supabase Auth email webhook — renders and enqueues signup/recovery/magic-link/invite/email-change emails | `false` (verified via `LOVABLE_API_KEY` webhook signature instead) | `LOVABLE_API_KEY` |
| `verify-otp-code` | Verifies a 6-digit signup/recovery OTP against the short-code alias table | `false` (public — used pre-auth) | — |
| `process-email-queue` | Dispatches queued auth/transactional emails (rate-limit aware) | `true` | `LOVABLE_API_KEY`, `LOVABLE_SEND_URL` |
| `check-email-exists` | Public: is this email already registered? | `false` | — |
| `check-user-exists` | Public: does this email/Google account already exist? | `false` | — |
| `check-google-signup` | Post-Google-OAuth: tells client new vs. existing user | `false` | — |
| `check-registration-availability` | Public: checks email + phone availability before signup | `false` | — |
| `sign-in-with-identifier` | Sign-in by phone/username identifier | `false` | — |
| `complete-google-registration` | Finishes profile for a Google-signup user (phone + password) | `true` | — |
| `google-oauth-callback` | Exchanges Google OAuth code for tokens, stores per-user | `true` | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `google-contacts-sync` | Fetches the user's Google Contacts | `true` | (reuses stored Google OAuth tokens) |
| `google-contacts-create` | Creates a Google Contact for the user | `true` | (reuses stored Google OAuth tokens) |
| `request-device-otp` | Sends a device-verification OTP on new/unknown device sign-in | `false` | — |
| `verify-device-otp` | Verifies the device OTP, binds the trusted device | `false` | — |
| `delete-account` | Permanently deletes a user + all associated data | `true` | — |
| `chat-backup` | Snapshots chats/media into the backup-media bucket | `true` | — |
| `chat-restore` | Restores chats from a backup manifest | `true` | — |
| `call-action` | Server-side actions for in-app voice/video calls | `true` | (Twilio secrets, see below) |
| `twilio-token` | Mints a Twilio Video access token | `false` | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` |
| `twilio-room` | Creates/completes Twilio Video rooms | `true` | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` |
| `twilio-voice-token` | Mints a Twilio Voice SDK token for outbound PSTN calls | `true` | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID` |
| `twilio-voice-twiml` | TwiML webhook Twilio calls when placing an outbound call | `false` (hit directly by Twilio, not the app) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_VOICE_TWIML_URL` |
| `send-call-push` | Sends an FCM push to wake the callee's device for an incoming call | `true` | `FCM_SERVICE_ACCOUNT_JSON` |

## Vault secrets (SQL / pg_cron only, not edge-function env vars)

| Vault secret name | Used by |
|---|---|
| `email_queue_service_role_key` | The `process-email-queue` pg_cron job (5s interval), so it can call the edge function via `net.http_post` without a hardcoded key in SQL. Managed via `vault.create_secret` / `vault.update_secret`; revert with `DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key'`. |

## Frontend (public) config

`src/integrations/supabase/client.ts` hardcodes the Supabase project URL and
**anon** key. This is intentional and safe — the anon key is meant to be
public; access control is enforced by Postgres RLS policies, not by hiding
this key. Do not add the service-role key or any other secret to frontend
code.

## Rotation checklist

If any secret above is ever exposed (pasted in chat, committed, logged,
etc.), rotate it at its source and update it in Supabase's Edge Function
Secrets (or Vault, for `email_queue_service_role_key`) — there is nothing to
update in this repo, since no real values are stored here.
