# ChiChat API

This folder documents the HTTP API of ChiChat's backend. The machine-readable
specification is [`docs/openapi.yaml`](../openapi.yaml) (OpenAPI 3.1).

Last checked against the code: 2026-10-21, main at `7b15c0d`.

## What the backend is

ChiChat has no server process of its own. The backend is:

| Part | Where the code is | Runs on |
|---|---|---|
| Database, row rules, database functions, triggers | `supabase/migrations/*.sql` | Supabase (Postgres) |
| Sign in, sessions, email codes | Supabase Auth settings (dashboard), no code here | Supabase Auth |
| Live updates (new messages, typing, call status) | Tables added to the realtime publication in migrations | Supabase Realtime |
| Files (photos, voice notes, avatars, backups, feedback screenshots) | Buckets and rules in migrations | Supabase Storage |
| 22 Edge Functions | `supabase/functions/<name>/index.ts` | Supabase Edge Functions (Deno) |
| Invite page `/i/<name>` | `api/invite.js` | Vercel Edge Function |

See [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) for why it is split this way.

## What `openapi.yaml` covers

Every endpoint whose code is in this repository: the 22 Edge Functions and
the invite page. Nothing else. A check (`npm run api:check`) fails if a
function folder is added without a path in the spec, or the other way round.

| Group | Endpoints | Called by |
|---|---|---|
| Registration and sign-in | `verify-otp-code`, `check-email-exists`, `check-registration-availability`, `check-google-signup`, `complete-google-registration` | App |
| Device verification | `request-device-otp`, `verify-device-otp` | App |
| In-app calls | `agora-token`, `twilio-token`, `twilio-room`, `call-action` | App; `call-action` by the Android lock screen |
| Paid phone calls | `twilio-voice-token`, `twilio-voice-twiml` | App; `twilio-voice-twiml` by Twilio |
| Notifications | `send-call-push` | App |
| Messages and media | `transcribe-voice` | App |
| Safety | `submit-report` | App |
| Account | `delete-account`, `chat-backup`, `chat-restore` | App |
| Internal | `process-email-queue`, `twilio-voice-twiml` | Database cron job, Twilio |
| Web pages | `GET /i/{name}` | Browsers and link previews |

\* No code in the current app calls these. See "Findings" below.

## What it does not cover

These are real and used by the app, but Supabase serves them, so their
shape comes from the database schema rather than from code here:

- **Tables** read and written directly with row rules: `profiles`,
  `conversations`, `conversation_participants`, `messages`, `calls`,
  `call_stats`, `typing_indicators`, `blocked_users`, `accepted_chats`,
  `device_push_tokens`, `chat_backups`, `feedback`, `invites`.
- **Database functions** called with `supabase.rpc`: `get_my_profile_private`,
  `update_my_profile`, `search_users`, `match_contacts_by_phone`,
  `start_direct_conversation`, `start_call`, `get_my_account_status`,
  `signup_allowed`, `log_app_error`, `is_app_admin`, and the admin page's
  `admin_overview`, `admin_find_users`, `admin_list_reports`,
  `admin_set_report_status`, `admin_list_feedback`,
  `admin_set_feedback_status`, `admin_list_errors`, `admin_call_minutes`,
  `admin_suspend_user`, `admin_restore_user`. The admin functions check
  `is_app_admin()` inside the database.
- **Storage buckets**: `chat-media` (private), `avatars` (public),
  `backup-media` (private), `feedback`.
- **Supabase Auth** endpoints (sign up, password sign-in, reset, refresh,
  Google sign-in).

Supabase publishes its own description of the table API for the project at
`https://pnpabtxvsrkrldpfmtaz.supabase.co/rest/v1/` (needs the public key).
The generated types in `src/integrations/supabase/types.ts` describe the same
schema for the app.

External services ChiChat calls are listed in
[`integrations.md`](integrations.md).

## Opening the docs

**Locally** (needs Node 18 or newer and an internet connection for the
viewer's script):

```bash
npm install
npm run api:docs        # builds the public copy, then serves it
# open http://localhost:8090
```

**Any editor**: open `docs/openapi.yaml` in an OpenAPI viewer, for example
the Swagger Editor or the "OpenAPI (Swagger) Editor" extension for VS Code.

**Online (optional)**: [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) explains how
to publish the viewer as a Render static site. Nothing is published yet.

The viewer shows the **public copy**: `npm run api:bundle` removes
everything marked `x-internal: true` (the email queue and the Twilio
webhook). "Try it out" is off by default because the only environment is
production. Add `?try=1` to the address to turn it on, and only use a test
account.

## Keeping it accurate

When you change a function:

1. Update its path in `docs/openapi.yaml` (request, responses, `x-verify-jwt`).
2. Run the checks:

   ```bash
   npm run api:check   # spec matches the function folders, config.toml and the app's calls
   npm run api:lint    # spec is valid OpenAPI 3.1
   ```

The same two checks run on every pull request that touches `supabase/`,
`api/`, `docs/` or `src/` (`.github/workflows/api-docs.yml`).

`api:check` cannot read request and response fields from the code. Those are
checked by reading the function when it changes.

## Findings from the 2026-10-21 audit

Found while reading the code for this documentation. Item 1 is fixed;
the others are still open.

1. **Fixed: `chat-restore` trusted a file the user can write.** Backups are
   now signed by `chat-backup`; restore reads only the user's own path, never
   adds anyone to a chat, only restores senders who are current members, and
   from an unsigned or edited file only the user's own messages. Migration
   `20261021120000_backups_server_only.sql` makes backup files and the
   `chat_backups` row server-written (users keep read access and the auto
   backup switch).
2. **Fixed 2026-10-23: unused public lookups removed.** `sign-in-with-identifier`
   and `check-user-exists` are gone from the repo. Delete them from the live
   project too (Edge Functions, each one, Delete).
3. **Fixed 2026-10-23: rate limits.** `check-registration-availability`,
   `request-device-otp` and the `match_contacts_by_phone` database function
   now have limits (see `authentication.md`).
4. **Fixed 2026-10-23: email lookups.** `check-email-exists` and
   `check-registration-availability` use the `email_registered` database
   function (one indexed lookup) instead of paging through 20 x 1000 users.
5. **Raw error text returned**: `twilio-token`, `twilio-room`,
   `twilio-voice-token`, `send-call-push`, `call-action`, `chat-backup` and
   `chat-restore` return internal error messages to the caller.
6. **`supabase/config.toml` is incomplete**: `agora-token`, `chat-backup`,
   `chat-restore`, `complete-google-registration`, `delete-account`,
   `send-call-push`, `submit-report`, `transcribe-voice`, `twilio-room` and
   `twilio-voice-token` are not listed, so they use Supabase's default
   (gateway JWT check on). The live settings were not checked.
