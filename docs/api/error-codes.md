# Error responses

## Shape

Edge Functions answer errors as JSON:

```json
{ "error": "<code or message>" }
```

Exceptions:

- `delete-account` adds `detail` and `partial_failures`.
- `transcribe-voice` adds `timings` to `transcription_failed`.
- `twilio-voice-twiml` answers Twilio with TwiML (`text/xml`), or plain text
  for a bad signature or missing configuration.
- The Supabase gateway answers its own errors (for example a missing or
  invalid JWT where the gateway check is on) in Supabase's format, before
  the function runs.

There is no shared error library: each function has its own codes, and the
style varies (`snake_case` codes in newer functions, short sentences in
older ones). Clients should check the HTTP status first, then the code.

## Errors returned with HTTP 200

Some functions return a normal-looking 200 that means "refused" so the app
can show a plain message. Always check for `error` or `blocked`:

| Endpoint | 200 body that means refused |
|---|---|
| `check-registration-availability` | `{ "error": "invalid_details" }` |
| `sign-in-with-identifier` | `{ "error": "missing_details" \| "phone_not_registered" \| "phone_ambiguous" \| "email_not_registered" \| "invalid_identifier" \| "email_not_verified" \| "wrong_password" }` |
| `twilio-voice-token` | `{ "blocked": "suspended" \| "too_new" \| "daily_limit" }` |
| `twilio-voice-twiml` | Spoken refusal (`<Say>…</Say><Hangup/>`) |

## Codes by status

| Status | Code | Endpoints | Meaning |
|---|---|---|---|
| 400 | `bad_request` | most | Body not JSON, or an unexpected error caught as a bad request |
| 400 | `invalid_email` | check-email-exists, check-user-exists | Missing, malformed or over 255 characters |
| 400 | `Wrong or expired code` | verify-otp-code | Code wrong, expired, or fields missing |
| 400 | `Invalid request` | verify-otp-code | Body not JSON |
| 400 | `not_google_session`, `invalid_name`, `invalid_phone`, `invalid_password` | complete-google-registration | Validation |
| 400 | `invalid_device`, `email_required` | request-device-otp | Validation |
| 400 | `invalid_input`, `expired`, `too_many_attempts`, `wrong_code` | verify-device-otp | Code problems |
| 400 | `Invalid roomName`, `Invalid params` | agora-token, twilio-token, twilio-room | Validation |
| 400 | `missing fields` | send-call-push, call-action | Required field missing |
| 400 | `empty_audio`, `audio_too_large` | transcribe-voice | Audio 0 bytes or over 15 MB |
| 400 | `Unsupported content type` | twilio-voice-twiml | Not form encoded |
| 401 | `unauthorized`, `Unauthorized`, `missing_authorization`, `invalid_session` | user endpoints, process-email-queue | No valid token |
| 403 | `Unauthorized`, `unauthorized` | call and push endpoints | Not a participant / not the sender |
| 403 | `not_allowed` | submit-report | Not in that chat together, or message mismatch |
| 403 | `invalid token` | call-action | Decline token does not match |
| 403 | `Forbidden` | process-email-queue | Not the service role |
| 403 | `Invalid signature` | twilio-voice-twiml | Not from Twilio |
| 404 | `not_found` | transcribe-voice | Voice note not readable by this user |
| 404 | `No backup found` | chat-restore | No backup yet |
| 405 | `invalid_request`, `method_not_allowed`, `Invalid request` | functions that check the method | Not POST |
| 409 | `phone_taken` | complete-google-registration | Phone number used by another account |
| 429 | `rate_limited`, `too_many`, or a sentence | rate limited endpoints | Slow down (see [authentication.md](authentication.md#rate-limits)) |
| 500 | `lookup_failed`, `service_unavailable`, `challenge_failed`, `update_failed`, `profile_failed`, `save_failed`, `server_error`, `transcription_unavailable`, `auth_user_delete_failed`, `unexpected`, `Server configuration error`, `Could not start the call`, `Please try again` | various | Server or configuration problem |
| 500 | raw error text | twilio-token, twilio-room, twilio-voice-token, send-call-push, call-action, chat-backup, chat-restore | Internal message passed through (see README finding 5) |
| 502 | `transcription_failed` | transcribe-voice | Transcription provider refused or failed |

## What the app shows

The app maps these to plain messages for people and does not show codes.
Keep it that way when adding codes: the code is for the app and the logs,
the message is the app's job.
