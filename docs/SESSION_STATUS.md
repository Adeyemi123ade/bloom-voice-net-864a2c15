# ChiChat: project status

Current state of the project for anyone picking it up (developers, testers,
reviewers). Updated 2026-10-21. Update this file in the same pull request
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
| Calls to phone numbers (dial pad) | Twilio Voice. Nigeria and UAE only, 30 minutes a day, accounts older than 24 hours |
| Incoming call ringing when the app is closed | Firebase Cloud Messaging plus native Android code in `android/app/src/main/java/` |
| Email | Resend (sign-up codes, password reset, reports to the support inbox) |
| Voice note transcription | Speech-to-text API through `transcribe-voice` |

More detail: `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/SECRETS.md`,
`docs/api/README.md`.

## Features in the app today

- Accounts: register with email code, sign in, Google sign-in (account chooser; returning accounts go straight in, new ones finish the pre-filled form), forgot password with code, delete account (in the app and at `/delete-account`).
- Chats: text, photos, videos, files, voice notes with transcription, reply, edit, copy and paste of media, forward, delete for me, delete for everyone, search, read ticks, typing, unread badges, chat backup.
- Calls: voice and video, call waiting with hold and swap, floating call window, call records in the chat, ringing on a locked phone, dial pad to phone numbers.
- Safety: block, report (person, chat, message), message requests from people not in your contacts, account suspension and ban list, limits for new accounts, admin page at `/admin` (admins only).
- App: 15 languages (Arabic right to left), dark mode, automatic update when a new web version is live, problem reports, Send feedback, version shown in Settings.

## Version

1.9 (Android versionCode 10). Web version comes from `package.json`; keep
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
| Google sign-in on Android: after Continue, people were left on the sign-in screen | `src/lib/appGoogleHandoff.ts`, `src/lib/googleAuth.ts`, `src/pages/GoogleReturn.tsx`, `AndroidManifest.xml` | Fix in PR `fix/google-signin-android`. Web part works on merge; the manifest change needs the next APK. Test on a phone with both a returning and a new Google account |
| Chat restore hole (backups could be edited to join chats or forge messages) | PR #86 | Merged. Confirm `chat-backup` and `chat-restore` are deployed and `20261021120000_backups_server_only.sql` was run |
| PR checks and branch protection | PR #87 | Check merged. Branch protection on main still to turn on in GitHub settings |
| Unused public functions `sign-in-with-identifier`, `check-user-exists` | `supabase/functions/` | Delete from the live project and the repo |
| No rate limit on `check-registration-availability`, `request-device-otp` | same | Open |
| 10 functions missing from `supabase/config.toml` | same | Open |
| "Message request" label on the chat list; typing indicator visible to a blocked person | `src/pages/Home.tsx`, `typing_indicators` rules | Open |
| Code splitting: main bundle is 2.3 MB and includes Twilio although calls use Agora | `src/App.tsx`, call files | Open |
| Split `ChatRoom.tsx` and `CallScreen.tsx` | PR #89 | Screens split (ChatRoom 2,268 to 1,387 lines; CallScreen 1,427 to 1,330). Next, after two-phone call tests: move message loading and sending into hooks, and split the call connection logic |
| Native Android crash reports (Firebase Crashlytics) | branch `feat/android-crashlytics` | Ready; merge before the release build, then enable Crashlytics in the Firebase console |
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

- Paid calls: Nigeria and UAE only, 30 minutes a day, 24 hour wait for new accounts. In-app calls unlimited.
- Reports and support inbox: techpath411@gmail.com.
- Android browsers see a closable "use the app" suggestion; web keeps working.
- Ringing keeps the media playback service type; change to a phone call service only if Google Play asks.
- Backend stays on Supabase; no separate server.

## History

Detailed session notes up to 2026-10-21 (what was built when and why) are
kept in the project workspace, not in the repo. Pull request descriptions on
GitHub hold the same detail for each change.
