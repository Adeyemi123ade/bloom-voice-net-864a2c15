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
  host now.
- Backend: Supabase (Postgres + Auth + Realtime + Storage + Edge
  Functions). Calls via Twilio. Transactional email via Resend.
- Native shell: Capacitor (Android). **The APK does not auto-update from
  web deploys** — `capacitor.config.ts` has no `server.url`, so it's a
  frozen bundle. Rebuilding/redistributing the APK has been explicitly
  deferred by the user each time it came up; only touch this if asked.

## Recently shipped (this session), newest first

- **#21** Suppress the browser's synthetic mouse-compat events at the
  source (`preventDefault()` on touchend) — third and strongest attempt
  at the long-press "blink" bug (see "Open / needs user confirmation"
  below — not yet confirmed fixed by the user).
- **#20** Fix long-press being undone by synthetic mousedown resetting
  the "already fired" flag (real bug, but incomplete fix — see #21).
- **#19** "Delete for everyone" now removes the message bubble entirely
  (no "🚫 message deleted" tombstone) on both sides.
- **#18** Fix long-press reverting due to hand-tremor being misread as
  swipe-to-reply (real bug, but not the dominant one — see #20/#21).
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

- **Long-press selection bar "blinking"** (Copy/Share/Delete become
  briefly visible then revert): this took three fix attempts (#18, #20,
  #21) because each one addressed a real but different contributing
  mechanism, confirmed via a frame-by-frame breakdown of a user-provided
  screen recording (extracted with opencv since no video-reading tool
  was available — see method below if this needs to happen again). As of
  #21 this is believed fixed, but **not yet confirmed live by the user**.
  If it recurs after #21, the next thing to check is whether Vercel's
  production deployment for chichatapp.com is actually tracking `main`
  commit-for-commit (this was assumed, not directly verified, since the
  sandbox this session ran in cannot reach chichatapp.com or any live
  URL — outbound network is allowlisted to a small set of domains like
  GitHub/npm, confirmed via `curl -sS "$HTTPS_PROXY/__agentproxy/status"`
  and a direct 403 test against chichatapp.com).
- **Google OAuth "Access blocked" error** for Google Contacts sync —
  unresolved, needs the user to check Google Cloud Console's redirect URI
  configuration. Not something fixable from this repo.
- **MobileFrame desktop-width look** (`src/components/MobileFrame.tsx`,
  `md:max-w-[460px] md:rounded-2xl md:shadow-2xl`) — user explicitly
  deferred revisiting this ("we'll come back to it later"). It's a
  deliberate existing design choice, not a bug.
- **Android APK rebuild** — explicitly deferred, see "Native shell" above.

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
- **PR workflow used throughout**: branch off latest `origin/main` for
  every fix (`git fetch origin main -q && git checkout -B <branch>
  origin/main -q`), typecheck/build/lint before pushing, open PR as
  draft, watch for the Vercel webhook comment to show `Ready`, mark ready
  for review, squash-merge. If a branch is built from a since-squash-
  merged parent, don't try to rebase onto latest main (produces spurious
  conflicts from content that's already equivalent) — `git diff
  origin/main --stat` to confirm the real diff, then cherry-pick just the
  new commit(s) onto a fresh branch from `origin/main` instead.
