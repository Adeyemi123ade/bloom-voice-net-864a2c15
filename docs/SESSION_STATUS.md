# ChiChat — Session Status

Running log of what's been done and what's still open, so a new chat
session (or another person) can pick up here without re-deriving context.
Update this file instead of relying on chat history carrying over.

Last updated: 2026-07-12.

## App identity

- Product: ChiChat, a WhatsApp-style chat app. Domain: `chichatapp.com`.
- Built originally in Lovable, now developed via GitHub + Claude Code,
  deployed on Vercel (auto-deploys `main` to production). Lovable's own
  hosting/DNS control has been fully disconnected — Vercel is the only
  host now. As of #22, there are **no remaining Lovable references
  anywhere in `src/`, `package.json`, or the lockfile** — the dev-only
  `lovable-tagger` plugin, Lovable branding meta tags, and the
  `@lovable.dev/cloud-auth-js` OAuth broker (see below) are all gone.
  `.lovable/plan.md` (an unexecuted backend-consolidation proposal, see
  "Open" below) is the only file left that mentions Lovable, and it's
  inert documentation, not code.
- Backend: Supabase (Postgres + Auth + Realtime + Storage + Edge
  Functions). Calls via Twilio. Transactional email via Resend. Google
  sign-in (Login/Register) authenticates directly through **Supabase's
  native Google provider** as of #22 — it used to go through Lovable's
  own hosted OAuth broker (`@lovable.dev/cloud-auth-js`), which was
  likely the real cause of the long-standing "Access blocked" Google
  error on sign-in, since the OAuth client Google was blocking belonged
  to Lovable, not to anything fixable via the user's own Google Cloud
  Console. User confirmed this works live after the swap.
- Native shell: Capacitor (Android). **The APK does not auto-update from
  web deploys** — `capacitor.config.ts` has no `server.url`, so it's a
  frozen bundle. Rebuilding/redistributing the APK has been explicitly
  deferred by the user each time it came up; only touch this if asked.

## Recently shipped (this session), newest first

- **#22** Bundle of four fixes, all confirmed live and working by the
  user on a real Android device before merge:
  - Long-press "blink and disappear" (Copy/Share/Delete bar appearing
    then instantly reverting) was still reproducing on real hardware
    after #18/#20/#21, which each suppressed the browser's ghost/
    synthetic click at a different point. Root cause: the whole chat
    screen's root `<div>` has `onClick={clearSelection}`, and nothing
    stopped a stray click — landing on whatever element ended up under
    the original touch point once the screen reflowed into selection
    mode — from reaching it and wiping the selection a moment after it
    was created. Fixed by guarding the action instead of the event:
    `clearSelection()` now refuses to run for 500ms after a long-press
    just created a selection (`selectFromLongPress` in
    `src/pages/ChatRoom.tsx`), regardless of where a stray click lands.
  - "Delete for everyone" reverted back to leaving a "🚫 This message
    was deleted" placeholder bubble (exact revert of #19) — full,
    traceless removal wasn't actually what was wanted. The separate
    "Delete for me" vs "Delete for everyone" choice, multi-select, and
    the "N selected" counter were already working and untouched.
  - Removed all Lovable traces from `src/` (see "App identity" above).
  - Swapped Google sign-in from Lovable's OAuth broker to Supabase's
    native Google provider (see "Backend" above).
- **#21** Suppress the browser's synthetic mouse-compat events at the
  source (`preventDefault()` on touchend) — third attempt at the
  long-press "blink" bug; superseded by #22's action-level guard once
  this alone proved insufficient on real Android hardware.
- **#20** Fix long-press being undone by synthetic mousedown resetting
  the "already fired" flag (real bug, but incomplete fix — see #21/#22).
- **#19** "Delete for everyone" removed the message bubble entirely (no
  tombstone) — reverted by #22, see above.
- **#18** Fix long-press reverting due to hand-tremor being misread as
  swipe-to-reply (real bug, but not the dominant one — see #20/#21/#22).
- **#17** Search: tapping a result jumps to and highlights that message
  in the real chat instead of leaving you in a filtered list; search
  always starts blank next time it's opened.
- **#16** Emoji picker docked inline below the composer (like a
  keyboard) instead of a modal sheet that covered the text you were
  typing. No internal search bar in the picker.
- **#15** Removed the duplicate camera button (the attach/paperclip
  button's native file picker already offers a camera option) and put an
  emoji picker in its place; quoted-reply preview now wraps up to 4 lines
  instead of truncating to 1.
- **#14** Copy now works for images (copies actual image bytes) and files
  (copies a link), not just text; "Forward" button relabeled "Share"
  (icon + label) to match what it already does; message bubbles tightened
  (timestamp floats inline with the last line of text instead of taking
  its own row); text size settled at 16px (`text-base`) after trying
  14px — see chat history if this needs revisiting, size preference was:
  16px → too small still at 14px → back to 16.
- **#13** Voice-to-text transcription via OpenAI Whisper
  (`supabase/functions/transcribe-voice`). Requires `OPENAI_API_KEY`
  secret in Supabase (done) and the function deployed (done, via
  Dashboard editor since the user has no Supabase CLI).

## Open / needs user confirmation

- **Google OAuth "Access blocked" for Google Contacts sync** (distinct
  from the sign-in flow fixed in #22) — this was originally documented
  against `google-contacts-sync`/`google-oauth-callback`
  (`GOOGLE_OAUTH_CLIENT_ID`/`SECRET`, its own Google Cloud OAuth client,
  separate from Lovable's broker). #22 did not touch this path. Still
  unverified whether it's still broken — worth explicitly re-testing
  Contacts sync specifically (not just sign-in) next time it comes up,
  since #22 may or may not have been the same underlying issue.
- **Backend consolidation** (`.lovable/plan.md`) — still just a
  proposal, never executed. `src/integrations/supabase/client.ts` is
  still hard-pinned to the old Supabase project (`pnpabtxvsrkrldpfmtaz`),
  waiting on the user to either kick off Phase 1 (exporting that
  project's data) or say they don't want to do this migration.
- **MobileFrame desktop-width look** (`src/components/MobileFrame.tsx`,
  `md:max-w-[460px] md:rounded-2xl md:shadow-2xl`) — user explicitly
  deferred revisiting this ("we'll come back to it later"). It's a
  deliberate existing design choice, not a bug.
- **Android APK rebuild** — explicitly deferred, see "Native shell" above.
  Note this means none of #12–#22's fixes (including the long-press and
  Google sign-in fixes) exist in the installed Android app — only in the
  chichatapp.com web app via a phone browser.

## Useful technique notes for future sessions

- **This sandbox cannot reach the live site or any arbitrary domain.**
  Don't assume `curl`/`WebFetch` to chichatapp.com or `*.vercel.app` will
  work — verify via `curl -sS "$HTTPS_PROXY/__agentproxy/status"` first.
  Deployment status must be checked through GitHub's commit-status API
  (`mcp__github__pull_request_read` method `get_status`) instead, which
  reflects what Vercel reports back to GitHub.
- **No email/OTP access** — can't sign up a real test account through the
  app's own flow (email verification blocks it). If live browser testing
  through an authenticated session is ever truly necessary, it requires
  the user to hand over test credentials.
- **Reading a user-provided screen recording**: the `Read` tool can't
  handle video. `playwright-core`'s bundled ffmpeg (under
  `/opt/pw-browsers/ffmpeg-*/ffmpeg-linux`) is a stripped build that only
  handles the codecs Playwright itself needs (mjpeg/vp8/png) — it can't
  decode a normal phone-recorded H.264 mp4. What worked: `pip3 install
  opencv-python-headless` (pypi.org is allowlisted through the proxy),
  then `cv2.VideoCapture` to pull frames, tile them into contact-sheet
  grids for a quick scan, then pixel-analyze a specific region (e.g.
  counting red pixels in the header band to detect exactly when a UI
  element appears/disappears) for frame-accurate timing without manually
  eyeballing hundreds of frames.
- **Bug-fixing workflow that worked well on the long-press issue**:
  reproduce the reported browser event sequence in an isolated static
  HTML+JS file (not the real app) driven by Playwright/CDP, confirm it
  reproduces the bug on the pre-fix logic, then confirm the fix holds on
  the same script. Cheap, fast, and catches reasoning mistakes before
  shipping — but as this session found out twice, a passing isolated
  repro isn't proof the *real* root cause is the one being tested if the
  mental model of the bug is incomplete. When a fix doesn't hold up
  against real user feedback a second time, the isolated repro
  methodology is still good; the theory feeding it needs to be
  re-examined against harder evidence (e.g. a real screen recording)
  rather than repeated the same way.
- **What actually closed the long-press bug after three failed attempts**:
  #18/#20/#21 each suppressed the ghost/synthetic click at a different
  point in the event chain (swipe-drift, synthetic mousedown, then
  `preventDefault()` on touchend) — each real, each insufficient on real
  Android hardware where the exact same "blink" symptom kept
  reproducing. The fix that held: stop chasing the event, guard the
  *action* instead. A screen-wide `onClick={clearSelection}` on the root
  container meant a stray click reaching it from anywhere could always
  undo a just-made selection, no matter which specific event-suppression
  trick was tried. Adding a short time-based lockout directly on
  `clearSelection()` itself (500ms after a long-press engages) closed it
  regardless of which element a stray click lands on or whether
  `preventDefault()` succeeds on a given browser/OS build. General
  lesson: when several distinct, individually-verified event-level fixes
  all fail to hold on real hardware, look for a single shared downstream
  effect (the state mutation itself) to guard, rather than continuing to
  chase upstream event sources one at a time.
- **PR workflow used throughout**: branch off latest `origin/main` for
  every fix (`git fetch origin main -q && git checkout -B <branch>
  origin/main -q`), typecheck/build/lint before pushing, open PR as
  draft, watch for the Vercel webhook comment to show `Ready`, mark ready
  for review, squash-merge. If a branch is built from a since-squash-
  merged parent, don't try to rebase onto latest main (produces spurious
  conflicts from content that's already equivalent) — `git diff
  origin/main --stat` to confirm the real diff, then cherry-pick just the
  new commit(s) onto a fresh branch from `origin/main` instead.
