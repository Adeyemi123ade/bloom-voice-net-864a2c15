# Migration to `pnpabtxvsrkrldpfmtaz` (single source of truth)

After this, the app and its backend live in **one** Supabase project. Lovable tools (Cloud / migrations / edge function deploys) will be **unused** — you manage everything via the Supabase dashboard + CLI.

---

## Prerequisites

1. Install Supabase CLI: `npm i -g supabase`
2. Log in: `supabase login`
3. Link this repo to the project (one-time):
   ```bash
   supabase link --project-ref pnpabtxvsrkrldpfmtaz
   ```

---

## Step 1 — Schema

Open Supabase Dashboard → SQL Editor → **New query** → paste contents of `01-schema.sql` → Run.

Then repeat with `02-storage.sql`.

Both files are idempotent (safe to re-run).

---

## Step 2 — Secrets

In Dashboard → **Project Settings → Edge Functions → Secrets**, add each:

| Name | Where to get it |
|------|------|
| `LOVABLE_API_KEY` | Same value currently in Lovable Cloud secrets |
| `GOOGLE_OAUTH_CLIENT_ID` | Same |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Same |
| `FCM_SERVICE_ACCOUNT_JSON` | Same (Firebase Console → Service Accounts) |
| `TWILIO_ACCOUNT_SID` | Same |
| `TWILIO_AUTH_TOKEN` | Same |
| `TWILIO_API_KEY_SID` | Same |
| `TWILIO_API_KEY_SECRET` | Same |
| `TWILIO_TWIML_APP_SID` | Same |
| `TWILIO_PHONE_NUMBER` | Same |

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS`, `SUPABASE_DB_URL` are **auto-injected** by Supabase — do not add manually.

---

## Step 3 — Deploy edge functions

From the repo root:

```bash
# First, update supabase/config.toml project_id to pnpabtxvsrkrldpfmtaz (see Step 6)
supabase functions deploy auth-email-hook --no-verify-jwt
supabase functions deploy verify-otp-code --no-verify-jwt
supabase functions deploy twilio-token --no-verify-jwt
supabase functions deploy twilio-voice-twiml --no-verify-jwt
supabase functions deploy check-email-exists --no-verify-jwt
supabase functions deploy check-user-exists --no-verify-jwt
supabase functions deploy sign-in-with-identifier --no-verify-jwt
supabase functions deploy check-registration-availability --no-verify-jwt
supabase functions deploy request-device-otp --no-verify-jwt
supabase functions deploy verify-device-otp --no-verify-jwt
supabase functions deploy check-google-signup --no-verify-jwt
supabase functions deploy process-email-queue
supabase functions deploy call-action
supabase functions deploy chat-backup
supabase functions deploy chat-restore
supabase functions deploy complete-google-registration
supabase functions deploy delete-account
supabase functions deploy google-contacts-create
supabase functions deploy google-contacts-sync
supabase functions deploy google-oauth-callback
supabase functions deploy send-call-push
supabase functions deploy twilio-room
supabase functions deploy twilio-voice-token
```

---

## Step 4 — Auth configuration (Dashboard)

**Authentication → Providers → Email**
- ✅ Enable Email provider
- ✅ Confirm email
- Disable "Confirm email change" if undesired

**Authentication → Providers → Google**
- ✅ Enable
- Client ID / Secret: same as `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET`
- Skip nonce check: leave default

**Authentication → URL Configuration**
- Site URL: `https://chichatapp.com`
- Redirect URLs (add all):
  - `https://chichatapp.com/**`
  - `https://www.chichatapp.com/**`
  - `https://bloom-voice-net.lovable.app/**`
  - `https://id-preview--84da0127-858b-4a61-9986-60ed33bc4997.lovable.app/**`
  - `http://localhost:5173/**`

**Authentication → Hooks (Beta)**
- Add **Send Email Hook** → URL: `https://pnpabtxvsrkrldpfmtaz.supabase.co/functions/v1/auth-email-hook`
- Copy the generated secret → save as `LOVABLE_API_KEY` is already used? No — auth hooks need their own. Set secret = your `LOVABLE_API_KEY` value.

**Authentication → Email Templates**
- Set every template body to `{{ .Token }}` only (the hook handles actual rendering). This forces Supabase to invoke your hook with a 6-digit token.

**Authentication → Rate Limits**
- Email OTPs per hour: bump to 30 if you expect testing.

---

## Step 5 — Cron job (email queue dispatcher)

Dashboard → **Database → Cron Jobs** → New job:
- Name: `dispatch-email-queue`
- Schedule: `* * * * *` (every minute)
- SQL:
  ```sql
  SELECT net.http_post(
    url := 'https://pnpabtxvsrkrldpfmtaz.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  ```
  Replace `<SERVICE_ROLE_KEY>` with the actual service role key from Dashboard → API.

Also add `cleanup-otp-aliases` (every 10 min):
```sql
SELECT public.cleanup_expired_auth_otp_aliases();
```

---

## Step 6 — Repo cleanup (I'll do this once you confirm Steps 1–5 done)

Tell me "schema deployed" and I will:
1. Update `supabase/config.toml` `project_id = "pnpabtxvsrkrldpfmtaz"`
2. Update `.env` to point at the new project URL + anon key
3. Simplify `src/integrations/supabase/client.ts` to read from env again
4. Remove duplicate Lovable Cloud reference

---

## Step 7 — Smoke test

1. Open https://chichatapp.com
2. Register a new account — verify OTP arrives
3. Sign in with Google
4. Send a message, place a call

If anything fails, check **Dashboard → Edge Functions → Logs** for the function name.

---

## Rollback

If something breaks badly, revert `src/integrations/supabase/client.ts` and `.env` to the previous commit. The old Lovable Cloud project still exists untouched.
