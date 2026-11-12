# ChiChat: project status

Current state of the project for anyone picking it up (developers, testers,
reviewers). Updated 2026-10-30. Update this file in the same pull request
as any change that makes it wrong.

## What ChiChat is

A WhatsApp-style chat and calling app. Website: https://www.chichatapp.com.
Android app id `com.bloomvoicenet.chat` (permanent once on Google Play).

| Part | What runs it |
| --- | --- |
| Web app | Vite + React + TypeScript + shadcn/ui, hosted on Vercel (main deploys to production, every PR gets a preview link) |
| Android app | Capacitor shell that loads the live site (`capacitor.config.ts` `server.url` = https://www.chichatapp.com). Web changes reach phones without a rebuild; only changes under `android/` need a new APK |
| Database, sign-in, live updates, files | Supabase (Postgres, Auth, Realtime, Storage) |
| Server code | 22 Supabase Edge Functions in `supabase/functions/` (list and shapes in `docs/openapi.yaml`) |
| In-app voice and video calls | Agora (default since PR #75). Switch back with Vercel env `VITE_CALL_ENGINE=twilio` |
| Calls to phone numbers (dial pad) | Twilio Voice. Nigeria and UAE only. Per person: plan (Free: dial pad off; Premium: on), switch, 20 minutes a day, 24 hour wait for new accounts unless switched on or Premium; one call at a time. Decided in the database (`paid_call_check`, `paid_call_begin`) |
| Incoming call ringing when the app is closed | Firebase Cloud Messaging plus native Android code in `android/app/src/main/java/` |
| Email | Resend (sign-up codes, password reset, reports to the support inbox) |
| Voice note transcription | Speech-to-text API through `transcribe-voice` |

More detail: `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/SECRETS.md`,
`docs/api/README.md`.

## Features in the app today

- Accounts: register with email code, sign in, Google sign-in (account chooser; returning accounts go straight in, new ones finish the pre-filled form), forgot password with code, delete account (in the app and at `/delete-account`).
- Chats: text, photos, videos, files, voice notes with transcription, reply, edit, copy and paste of media, forward, delete for me, delete for everyone, search, read ticks, typing, unread badges, chat backup, date pills between days with a floating date while scrolling, jump-to-latest button.
- Calls: voice and video (switch to video either way; camera and microphone come back by themselves if they stop), loudspeaker/earpiece with headset and Bluetooth following (Android app; needs the APK with `CallAudioRoute.java`), call waiting with hold and swap, floating call window, call records in the chat, ringing on a locked phone, dial pad to phone numbers.
- Safety: block, report (person, chat, message), message requests from people not in your contacts, account suspension and ban list, contact privacy ("Start a new chat" shows only people you chat with and your own contacts; phone numbers are visible only to their owner), limits for new accounts, admin page at `/admin` (admins only): per person suspend (optional end date), ban, remove for good, restore, call plan and dial pad switch, daily minutes, app to app calls switch (abuse only), minute balance (kept, not used yet), test account tag, history of admin actions. Test accounts and anything sent from preview links or laptop copies are hidden unless "Show test data" is on.
- App: 15 languages (Arabic right to left), dark mode, automatic update when a new web version is live, problem reports, Send feedback, version shown in Settings.

## Version

1.10 (Android versionCode 11). Web version comes from `package.json`; keep
`android/app/build.gradle` `versionName` the same when the Android app is
rebuilt. Raise `versionCode` for every Play upload.

## How changes reach users

1. Every change is a pull request. Nobody pushes to main.
2. GitHub runs the `checks` job on every PR (`.github/workflows/pr-checks.yml`): typecheck, lint (errors fail), unit tests, build. Branch protection on main requires it.
3. Vercel posts a preview link on the PR. Test it on a phone and a laptop before merging. The preview uses the real database.
4. Database changes are separate SQL files in `supabase/migrations/`, each with "how to apply" and "how to undo" at the top. They are applied by hand in the Supabase SQL Editor.
5. Edge functions are deployed by hand from the Supabase dashboard. A PR that changes a function says which ones to deploy and in what order.
6. If a merge breaks the live site: Vercel, Deployments, previous deployment, Instant Rollback.

Local run: `npm install`, `npm run dev` (http://localhost:8080). Tests:
`npm test`. Checks as in CI: `npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npm test && npm run build`.

## Repo rules

- Commits are authored as `Sulaimon <teshoade2020@gmail.com>`.
- No AI tool branding or attribution in commits, PRs or files.
- Never commit secrets, `.env`, `android/keystore.properties`, keystores or `google-services.json` (all gitignored).
- Unit tests live in `src/test/` and are committed. Browser test harnesses and screenshots are not.
- Text users see is plain language, never technical errors. Technical details go to the logs.
- Colour changes are global (`src/index.css`), never per screen.
- Don't change live Supabase settings, Google OAuth credentials or production without the owner's go-ahead.

## Open work

| Item | Where | State |
| --- | --- | --- |
| Admin controls per person, call plans, test data out of admin | `20261030090000_admin_controls_call_plans.sql`, `src/components/admin/PersonDialog.tsx`, branch `feat/admin-controls-call-plans` | Built, not merged. Order: run the SQL, deploy `twilio-voice-token`, `twilio-voice-twiml`, `submit-report`, merge, tag test accounts, run the test data cleanup. After the SQL the dial pad is off for everyone except the admin account until switched on per person. No new APK |
| Security audit 2026-10-28 (secrets, history, RLS, functions, uploads, XSS, headers, dependencies) | `20261028200000_security_hardening.sql`, `vercel.json`, `src/lib/signedMedia.ts`, branch `fix/security-audit` | No secrets in code or history. Fixed: attachment `javascript:` links (account takeover), signed-out access to database functions, open chat-insert rule, phone blanking by direct write, upload limits, photo listing, security headers + CSP, Android backups, dependency updates, unused packages. Order: run the SQL, merge, then run the live security check. Open: React Router 7 and Vite/Vitest major upgrades; Google return link should require a sign-in started by the app (needs a phone test); turn on Supabase leaked-password protection |
| Locked or long-idle phones: call screen silent, or no ring until opened (since 1.9 dropped the battery exemption, Oct 21) | `CallNotificationHelper.java`, `ChiChatMessagingService.java`, `CallActionReceiver.java`, `call-action`, `send-call-push` (merged 2026-10-28; needs the 1.12 APK) | The call notification now rings by itself (Android plays the channel sound; no background service, no battery setting); late call alerts show as missed; hang-up goes urgent. PR check now compiles the Android app. Order: deploy `call-action` and `send-call-push`, merge, build and install 1.12. After everyone has 1.12, the battery switch can leave the one-time call setup prompt |
| Registered people shown as Invite: accounts with no phone number | `20261028090000_phone_required.sql` (merged 2026-10-28, SQL run) | Live check 2026-10-28: every migration applied, all 9 saved numbers correct, 3 Google sign-ins (Oct 22, 25, 26) with no number at all. Now every account must add a number before using the app (the check no longer lets people in when it fails); the server refuses messages and calls without one; Profile can't erase it; numbers saved as 00…, without + or as local numbers are read correctly; the phone book is checked at most every 30 minutes unless it changed; the database records which migrations ran (Admin shows it). Order: run the SQL, then merge. No function deploy, no new APK |
| Contacts shown as Invite; signed-out phones ringing; caller ringing too early | `20261026120000_phone_at_signup_push_sessions_ringing.sql`, `send-call-push` | Done: confirmed live 2026-10-28 |
| Calls not reaching the phone next to you; Calling stuck; pop-ups at call end | branch `fix/call-delivery-status` | Open app now also finds a ringing call from its push, after a reconnect and when it comes back on screen; silent pushes go normal priority (Google downgraded the app's urgent pushes); app and push function keep working if the SQL wasn't run; end of call shown in the status line; one-time call setup switches after sign-in (Android, only when something is off). Deploy `send-call-push` and `call-action`, then merge |
| Native call follow-ups (need a new APK) | `android/app/src/main/java/` | In branch `fix/call-delivery-status`: closed app reports ringing (`CallActionReceiver.reportRinging`). Still open: ignore pushes for an account not signed in on the phone, native timing marks for slow answers |
| Google sign-in on Android (browser flow fails at Supabase: "Unable to exchange external code") | `ChiChatGooglePlugin.java`, `src/lib/googleAuth.ts`, `docs/GOOGLE_SIGN_IN.md` | Native picker in PR `feat/native-google-signin`. Needs the Android OAuth client (package + SHA-1) in Google Cloud and a new APK |
| Chat restore hole (backups could be edited to join chats or forge messages) | PR #86 | Merged. Confirm `chat-backup` and `chat-restore` are deployed and `20261021120000_backups_server_only.sql` was run |
| PR checks and branch protection | PR #87 | Check merged. Branch protection on main still to turn on in GitHub settings |
| Unused public functions `sign-in-with-identifier`, `check-user-exists` | `supabase/functions/` | Removed from the repo (branch `fix/contact-privacy`). Delete them from the live project too |
| Contact privacy and limits (open user directory, readable phone numbers, signed-out phone to email lookup, bulk number checks) | `20261023090000_contact_privacy.sql`, `20261023120000_contact_match_limits.sql`, `src/lib/newChatPeople.ts` | Branch `fix/contact-privacy`. Run both SQL files in order, deploy `check-registration-availability`, `check-email-exists`, `request-device-otp`, then merge |
| Rate limit hardening (audit items 1 to 5) | `20261023150000_rate_limit_hardening.sql`, `supabase/functions/_shared/rateLimit.ts` | Branch `fix/contact-privacy`. Limit function server only, real client IP, indexed email lookup, per email/phone limits, looser per-network limits, hourly clean-up. Items 7 (delete unused functions live) and 8 (device code function) still to decide |
| Google Contacts on web | `src/lib/googleContacts.ts`, Contacts screen "Import from Google" | Built on `fix/contact-privacy` (website only; Android keeps the phone book). Needs in Google Cloud: People API on, contacts.readonly on the consent screen, chichatapp.com as a JavaScript origin on the web client (`docs/GOOGLE_SIGN_IN.md`). The old deployed `google-oauth-callback`, `google-contacts-sync`, `google-contacts-create` are not used and can be deleted |
| 10 functions missing from `supabase/config.toml` | same | Open |
| "Message request" label on the chat list; typing indicator visible to a blocked person | `src/pages/Home.tsx`, `typing_indicators` rules | Open |
| Code splitting: main bundle is 2.3 MB and includes Twilio although calls use Agora | `src/App.tsx`, call files | Open |
| Split `ChatRoom.tsx` and `CallScreen.tsx` | PR #89 | Screens split (ChatRoom 2,268 to 1,387 lines; CallScreen 1,427 to 1,330). Next, after two-phone call tests: move message loading and sending into hooks, and split the call connection logic |
| Chat dates, jump button, video switch, mic and loudspeaker fixes | branch `feat/chat-dates-call-fixes` | Web changes live on merge. Loudspeaker needs a new APK (new native `CallAudioRoute.java` and two plugin methods); older APKs show "Update the ChiChat app to use the loudspeaker". Two-phone test still to do |
| Native Android crash reports (Firebase Crashlytics) | `android/build.gradle`, `android/app/build.gradle` | Merged as PR #90 (in every APK built from main with `google-services.json`). Still to do: open Crashlytics in the Firebase console once so reports appear |
| Chat membership hole (anyone could add themselves to a chat whose id they knew) | `20261024090000_chat_membership_rule.sql` | Branch `fix/chat-membership-rule`. Run the SQL; no app change |
| Native speaker check of the 14 translations | `src/lib/i18n/` | Before public launch |
| Tester guide with acceptance criteria | owner | Waiting |
| Release build (signed .aab) and Google Play Console account | owner | After the items above |

## Not verifiable from the repo

These live in dashboards. Check them before each tester round:

- Supabase: every migration up to the latest applied; deployed functions match the repo; secrets set (see `docs/SECRETS.md`).
- Twilio: still a trial account (dial pad reaches verified numbers only); Geo Permissions only Nigeria and UAE; usage alerts.
- Agora: project in secure mode, data center Germany.
- Vercel: production tracks main; `VITE_CALL_ENGINE` not set (Agora).
- Firebase: `google-services.json` on the build laptop matches the project.

## Decisions on record

- Paid calls (2026-10-30): Nigeria and UAE only. Free plan: dial pad off; Premium: on. 20 minutes a day, minute balance built but not charged yet. 24 hour wait for new accounts unless an admin switched the dial pad on or they are Premium. App to app calls on for everyone; the per person switch is for abuse only.
- Removed accounts (2026-10-30): closed for good by an admin; their earlier messages stay in other people's chats under their real name. Accounts people delete themselves are still wiped completely.
- Admin page shows real users only: test accounts are tagged, and preview and laptop data is hidden by default.
- Reports and support inbox: techpath411@gmail.com.
- Android browsers see a closable "use the app" suggestion; web keeps working.
- Ringing keeps the media playback service type; change to a phone call service only if Google Play asks.
- Backend stays on Supabase; no separate server.

## History

Detailed session notes up to 2026-10-21 (what was built when and why) are
kept in the project workspace, not in the repo. Pull request descriptions on
GitHub hold the same detail for each change.
