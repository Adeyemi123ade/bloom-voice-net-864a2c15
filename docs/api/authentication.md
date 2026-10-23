# Authentication and authorization

## Who can call what

| Caller | Credential sent | Endpoints |
|---|---|---|
| Anyone (before sign in) | Public key only | `verify-otp-code`, `check-email-exists`, `check-registration-availability`, `GET /i/{name}` |
| Signed-in user | `Authorization: Bearer <access token>` and `apikey: <public key>` | Every other app endpoint |
| Android lock screen (no session) | Public key, plus a per-call `token` in the body | `call-action` |
| Twilio | `X-Twilio-Signature` header | `twilio-voice-twiml` |
| Database cron job | Service role key | `process-email-queue` |

## The keys

| Key | Secret? | Where it lives |
|---|---|---|
| Public (anon / publishable) key | No. It is in the web app and Android app. It identifies the project; it does not grant access to data. | `src/integrations/supabase/client.ts` |
| User access token | Yes, for that user. Expires after about an hour; the SDK refreshes it. | The device's local storage |
| Service role key | Yes. Full access, bypasses every row rule. | Supabase only (auto-injected into functions, and in Vault for the cron job) |
| Twilio auth token, API key secret, Agora certificate, Firebase service account, Resend and transcription keys | Yes | Supabase Edge Function secrets only |

Never put a secret in the app, this repository, a document, or a request
you share. [`docs/SECRETS.md`](../SECRETS.md) lists which function needs
which secret.

## Two layers of checks

1. **Supabase gateway** (`verify_jwt` in `supabase/config.toml`, shown as
   `x-verify-jwt` in the spec). When on, Supabase refuses a request without
   a valid JWT before the function runs. Functions not listed in
   `config.toml` default to on.
2. **The function itself.** Every function that needs a user reads the
   token and checks it again (`auth.getClaims` or `auth.getUser`), so it is
   protected even where the gateway check is off (`check-google-signup`,
   `request-device-otp`, `verify-device-otp`, `twilio-token`).

## Who may act on what

Functions that use the service role check ownership in code:

| Endpoint | Rule |
|---|---|
| `agora-token`, `twilio-token`, `twilio-room` (complete) | Caller or callee of the `calls` row with that room name |
| `send-call-push` call | Caller of the call, and `calleeId` must match |
| `send-call-push` cancel | Caller or callee |
| `send-call-push` message | Sender of the message |
| `call-action` | HMAC token made by `send-call-push` for that call id and callee id |
| `submit-report` | Reporter and reported person share the chat; the message belongs to the reported person |
| `transcribe-voice` (stored note) | Read with the user's own token, so the `chat-media` rules apply (people in that chat) |
| `delete-account`, `chat-backup`, `chat-restore`, `complete-google-registration`, device functions | The signed-in user's own data only |
| `twilio-voice-twiml` | Twilio signature; caller id from `client:<user id>`; paid call rules (Nigeria and UAE numbers, 24 hour wait, 30 minutes a day, not suspended) |
| `process-email-queue` | Token role must be `service_role` |

Direct table access is governed by the row rules in `supabase/migrations/`.
The admin database functions check `is_app_admin()`.

## Rate limits

Stored in the database (`check_rate_limit`, callable by the server only). Keys
are hashed: the table never holds a raw IP, email or phone number. Rows older
than 2 days are deleted every hour (`cleanup-rate-limits` job). If the check
itself fails, the request is allowed (fails open), so a database problem does
not block sign in.

"Per IP" means the caller's public address: the right-most public entry of
`x-forwarded-for` (the one the platform's proxy adds), not the first entry,
which the caller can fake. Each call logs `[client-ip] used=... entries=...
cf=...` (no address) so this can be checked in the function logs.

| Endpoint | Limit |
|---|---|
| `verify-otp-code` | 10 per 5 min per email and code type; 30 per 5 min per IP |
| `check-email-exists` | 60 per 10 min and 500 per day per IP; 10 per hour per email (shared with the next row) |
| `check-registration-availability` | 60 per 10 min and 500 per day per IP; 10 per hour per email and per phone (shared with the row above) |
| `request-device-otp` (code emails) | 5 per 15 min and 20 per day per person |
| `match_contacts_by_phone` (database) | 30,000 numbers per hour and 100,000 per day per person |
| `submit-report` | 20 per hour per user |
| `transcribe-voice` | 30 per hour per user |
| `verify-device-otp` | 5 wrong codes per challenge |
| `twilio-voice-twiml` | 30 minutes of paid calls per user per UTC day; 30 minutes per call |

Supabase Auth has its own limits for its endpoints, set in the dashboard.

## Testing an authorised request safely

1. Use a **test account**, never a real person's. The only environment is
   production, so every call is real: `delete-account` deletes, pushes ring
   phones, transcription and paid calls cost money.
2. Get its access token: sign in on chichatapp.com in a desktop browser,
   open the developer tools, and in Local Storage read the
   `access_token` field of the `sb-pnpabtxvsrkrldpfmtaz-auth-token` entry
   (the Supabase SDK's default storage key).
3. Send it as in [`examples.md`](examples.md). Do not paste the token into
   chat, issues or pull requests; it is a password for that account until
   it expires.

## Data protection notes

- Transport is HTTPS everywhere (Supabase, Vercel, all providers).
- Messages are not end-to-end encrypted. They are stored in Postgres and
  readable by the service role. End-to-end encryption is planned for 2027.
- Device codes are stored as SHA-256 hashes, valid 10 minutes.
- `chat-media` is private (signed links). `avatars` is public.
- Voice notes sent for transcription leave ChiChat for the transcription
  provider (see [`integrations.md`](integrations.md)).
