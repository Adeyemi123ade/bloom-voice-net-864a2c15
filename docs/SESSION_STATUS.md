# ChiChat — Session Status

Running log of what's been done and what's still open, so a new chat
session (or another person) can pick up here without re-deriving context.
Update this file instead of relying on chat history carrying over.

Last updated: 2026-07-15.

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

- **#32** #30's `adoptRealId` fix (real row id adopted synchronously right
  after `insert()` resolves, instead of waiting on the realtime echo to
  reconcile by content match) was merged and deployed, then user-tested in
  a fresh incognito window — ruling out both the frozen-APK trap and
  browser caching — and the exact same symptom was still 100% reproducible:
  every sent message (not just voice) renders as a contentless timestamp-
  only bubble, with delete/copy/share doing nothing on it.
  Re-derived the fix from scratch and found a real gap in #30's own logic:
  `adoptRealId` and the realtime INSERT handler each independently guard
  against the *other* arriving first, but neither guarded against **both
  landing for the same message** — which happens whenever the realtime
  echo (an already-open WebSocket push) wins the race against the
  `insert().select("id")` REST round trip and arrives with content that
  doesn't textually match the local optimistic copy (the known blank-
  payload race, or simply arriving before local state had adopted the real
  id yet). In that case the *old* `adoptRealId` did a plain `.map()` over
  the tmp id, landing a second row in state with the exact same real id as
  the one the realtime handler had already appended — a React key
  collision. One of the two colliding rows is the blank/broken one; which
  one users actually end up looking at/tapping depends on render order,
  which is why it looked total and consistent rather than occasional.
  Fixed `adoptRealId` to detect this collision explicitly (a second entry
  already present under the real id) and collapse to a single row,
  preferring whichever copy actually has content. Added a
  `console.warn("[msg-send] realtime echo beat the insert() response...")`
  right on this path — if this keeps showing up in production, it confirms
  the echo is winning the race routinely (not as a rare edge case), which
  would be worth investigating on the Realtime/infra side directly rather
  than continuing to harden the client against it. **Still not confirmed
  live as of writing** — ask the user to retest with the browser console
  open and share what `[msg-send]` / `[voice-send]` / `[realtime]` lines
  appear if this still doesn't resolve it, since this sandbox has no way to
  reproduce the race itself.
- **#31 (same PR as #30, folded in mid-session)** Voice and video calls
  disconnecting the instant the callee answers, saying "room completed."
  Root cause: `twilio-room`'s room creation set `EmptyRoomTimeout` /
  `UnusedRoomTimeout` to 1 minute — in place since May 1, not a new
  regression. The room's expiry clock starts the moment it's created,
  which happens *before* the callee even receives the incoming-call push
  (`startCall` in `ChatRoom.tsx`: create room → insert `calls` row → fire
  `send-call-push`, in that order). The caller's own ring timeout is 45s,
  leaving only ~15s of slack on top of that for FCM delivery + Android
  wake-up + the callee actually tapping Accept — any real-world push delay
  (cold start, Doze mode, flaky network) blew through that margin, so
  Twilio had already auto-completed the room by the time the callee's
  client tried to join. Affects voice and video identically since both are
  audio/video Twilio *Video* rooms here, not real telephony — same room
  creation path. Fixed by bumping both timeouts to 5 minutes; normal call
  teardown already explicitly closes the room via `completeRoom()`, so the
  wider margin only matters for a crashed/disconnected client. **Not yet
  confirmed live** — found and fixed from a live user report mid-session,
  but this sandbox cannot place a real Twilio call to verify end to end.
- **#30** Root-caused two separate long-standing complaints instead of
  patching their symptoms:
  - **Voice notes deliver as an empty placeholder bubble; Delete/Copy/
    Forward silently no-op on them.** Traced the full send→delivery
    pipeline (recording → storage upload → `messages` insert → realtime
    broadcast → receiver render). The sender-side optimistic message was
    only ever reconciled with its real DB row by matching `sender_id` +
    exact `content` string against the realtime INSERT echo — if that echo
    ever arrived with blank `content` (a known, previously-observed
    replication/read-consistency race — see #28) the match silently failed,
    leaving the message stuck forever under its temporary `tmp-...` id.
    Every action on it (delete-for-everyone, etc.) issues a DB write scoped
    to that id, which matches zero rows and no-ops without erroring —
    exactly the "looks broken, does nothing" behavior reported. Fixed by no
    longer depending on the echo at all for reconciling *our own* sends:
    `send()`/`uploadVoice()`/`sendPending()` now capture the real row id
    directly from the `insert().select("id")` response and adopt it into
    local state (and selection state) immediately, synchronously, before
    the realtime event can even arrive. Also hardened the receiver-side
    self-heal from #28 (which re-fetches a message that arrives with blank
    `content`) to retry with backoff instead of a single attempt, since a
    single re-fetch can itself lose the same race. Added `[msg-send]` /
    `[voice-send]` / `[realtime]` console diagnostics through the pipeline.
  - **Google Contacts sync "not functioning."** Two real bugs in
    `google-contacts-sync`: (1) if the OAuth access-token refresh failed for
    *any* reason other than `invalid_grant` (network blip, `invalid_client`
    from a Cloud Console misconfiguration, etc.), the code silently fell
    through and called the People API with the known-stale token anyway —
    the resulting 401 wasn't distinguished from "this account genuinely has
    zero contacts," so a broken token connection and an empty address book
    looked identical to the user. (2) Same class of gap if the People API
    rejected the token mid-sync (e.g. user revoked access from their Google
    Account). Both now return `reconnectRequired: true` with a clear message
    instead of masquerading as "no contacts found." Also found and fixed a
    redirect_uri inconsistency in `google-oauth-callback`: the client picks
    between the bare and `www.` domain based on `window.location.origin`,
    but the server unconditionally collapsed every non-localhost redirect to
    the bare domain, so a user starting the connect flow from
    `www.chichatapp.com` had Google's authorization request built with the
    wrong domain — the callback landing page then depended on a
    platform-level cross-domain redirect preserving `?code=&state=` to still
    work. Server now echoes back the client's asserted redirect_uri when
    it's one of the two known-good production URIs, removing that
    dependency. **Still open and NOT fixable from this codebase:** if
    Contacts sync fails even after these fixes, the most likely remaining
    cause is Google Cloud Console OAuth consent screen configuration — the
    `contacts` scope is a sensitive/restricted scope that requires either
    app verification or the user's Google account being added as a test
    user, and `directory.readonly` additionally requires a Workspace admin
    grant for non-personal accounts. This sandbox cannot reach Google's
    OAuth endpoints or the live Supabase project to verify live behavior end
    to end — see "Useful technique notes" below for why, and re-verify with
    the user on real hardware.
- **#29** Re-audited the long-standing "delete/forward/copy don't work on
  mobile web" complaint after user re-reported it despite #18-22 having been
  confirmed fixed on real hardware. Found the actual remaining root cause by
  reproducing real Chrome touch→mouse-event synthesis via CDP
  (`Input.dispatchTouchEvent`, following the technique note below): `SwipeRow`
  and `CallRow`'s `onTouchEnd` called `e.preventDefault()` **unconditionally**
  on every touch, not just after a long-press. Confirmed empirically that
  this fully suppresses the browser's synthetic `click` for a **plain tap
  too**, not just the ghost click after a long-press — meaning `onTap`
  (tap-to-add-a-message-to-an-active-selection, tap-a-search-result-to-jump)
  had **no way to ever fire from a real touchscreen**, only from an actual
  mouse. This is exactly why it worked on desktop (real clicks) and not on
  Android web (touch never produces one). Long-press-to-select-the-first-
  message still worked fine since it doesn't depend on click at all — so a
  single-message copy/delete could look like it "sort of" works while
  multi-select and search-jump were dead. Fix: only call `preventDefault()`
  when this touch actually fired the long-press or completed the
  swipe-to-reply; a plain tap now lets its click through normally.
  Also fixed while auditing the same area:
  - `copyMsg`'s image-copy path awaited the signed-URL fetch *before*
    calling `navigator.clipboard.write()`, which can lose the click's
    "transient activation" on the slower/higher-latency mobile network path
    (stricter browsers require clipboard-write to happen inside that
    window). Now passes a pending `Promise<Blob>` into `ClipboardItem`
    instead, so `clipboard.write()` itself is invoked synchronously.
  - `shareMsgs`'s catch block silently swallowed every error, including
    real ones (only `AbortError` — user closed the share sheet — should be
    silent); it now surfaces a toast for anything else.
  - `AttachmentBubble`'s full-screen `ImageViewer` had its own, never-fixed
    copy of the exact #18-22 "long-press menu instantly closes" bug: its
    backdrop's `onClick={() => setMenuOpen(false)}` had no guard against the
    ghost click landing on it right after the long-press that just opened
    the menu. Applied the same proven fix (time-guard the close action, not
    the event).
  - `saveHidden` (delete-for-me persistence) now catches `localStorage`
    write failures for symmetry with `loadHidden`, instead of throwing
    uncaught out of `deleteForMe`.
  Note: PR #28 (voice playback/blank-incoming-message) was *also* already
  merged to `main` before this session started — if those symptoms are
  still being seen, that's either a stale/undeployed build or a genuinely
  different recurrence worth re-diagnosing fresh rather than assuming #28's
  fix didn't work.
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
  separate from Lovable's broker). #22 did not touch this path. #30 fixed
  two real code bugs here (silent-fallthrough on token refresh failure
  masquerading as "no contacts"; redirect_uri not matching the domain the
  user actually started from) but could not verify live behavior end to
  end (no network access to Google's OAuth endpoints or the live Supabase
  project from this sandbox — see "Useful technique notes"). If sync still
  fails after #30, the next thing to check is the Google Cloud Console
  OAuth consent screen: whether the app is verified for the `contacts`
  scope, or the testing user's Google account is on the test-users list —
  that's outside this codebase and needs the user's Google Cloud project
  access to confirm.
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
