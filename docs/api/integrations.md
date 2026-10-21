# External integrations

Services ChiChat calls. Credentials are Supabase Edge Function secrets
(names in [`docs/SECRETS.md`](../SECRETS.md)); none are in the app except
the public identifiers noted. Provider documentation links were opened and
checked on 2026-10-21.

| Provider | Used for | Called from | Credentials (names only) | Provider docs |
|---|---|---|---|---|
| Supabase | Database, Auth, Realtime, Storage, Edge Functions | App directly (public key + user token), functions (service role) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected) | https://supabase.com/docs |
| Agora | In-app voice and video calls (default engine, rooms `ag-…`) | Pass from `agora-token`; media from the app with the Agora SDK | `AGORA_APP_ID` (also returned to the app; public), `AGORA_APP_CERTIFICATE` | https://docs.agora.io/en/video-calling/get-started/authentication-workflow |
| Twilio Video | In-app calls in older rooms (`chichat-…`) or when `VITE_CALL_ENGINE=twilio` | `twilio-token`, `twilio-room` (REST `video.twilio.com/v1/Rooms`); media from the app | `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` | https://www.twilio.com/docs/video |
| Twilio Programmable Voice | Dial pad calls to Nigerian and UAE numbers | Pass from `twilio-voice-token`; Twilio calls `twilio-voice-twiml` | `TWILIO_TWIML_APP_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, optional `TWILIO_VOICE_TWIML_URL` | https://www.twilio.com/docs/voice/sdks/javascript, https://www.twilio.com/docs/usage/security#validating-requests |
| Firebase Cloud Messaging (HTTP v1) | Ringing and message notifications on Android | `send-call-push` (`fcm.googleapis.com/v1`, token from `oauth2.googleapis.com`) | `FCM_SERVICE_ACCOUNT_JSON` | https://firebase.google.com/docs/cloud-messaging/send/v1-api |
| Resend | Device codes (through the queue) and report emails; also Supabase Auth's SMTP | `process-email-queue`, `submit-report` (`api.resend.com/emails`); Supabase Auth SMTP | `RESEND_API_KEY` (SMTP password is set in the Supabase dashboard); optional `REPORTS_TO`, `REPORTS_FROM` | https://resend.com/docs/api-reference/emails/send-email |
| OpenAI audio transcription | Voice to text | `transcribe-voice` (`api.openai.com/v1/audio/transcriptions`) | `OPENAI_API_KEY`, optional `TRANSCRIBE_MODEL` | https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create |
| Google Sign-In | Sign in with Google | Supabase Auth's Google provider (configured in the dashboard), started from the app | Google client id and secret in the Supabase Auth settings | https://supabase.com/docs/guides/auth/social-login/auth-google |
| Vercel | Hosts the web app and the invite page | `vercel.json`, `api/invite.js` | `VITE_CALL_ENGINE` (optional, build time) | https://vercel.com/docs/functions |

## Notes

- **Transcription sends audio outside ChiChat.** The privacy policy should
  keep saying so. The provider is named here because developers need it;
  the app itself does not name it.
- **Google Contacts sync** (`google-oauth-callback`, `google-contacts-sync`,
  `google-contacts-create`) is described in older notes but has no source in
  this repository. `docs/SECRETS.md` lists what was found deployed.
- The app talks to Agora and Twilio media servers directly once it has a
  pass. Those connections are not ChiChat endpoints and are not in the spec.
