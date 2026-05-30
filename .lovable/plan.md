## Goal
When one party on a voice call taps the video icon, it should send a **request** to the other party. The call only switches to video after the other party accepts and enables their own camera. Today, the initiator's side flips to video unilaterally — the other side stays audio-only, so they're never "on the same page".

## Current behavior (problem)
In `src/pages/CallScreen.tsx` → `upgradeToVideo()`:
- Publishes a local video track immediately
- Sets `isVideo = true` locally
- Other party receives the remote video but has no UI to share their own camera, and no awareness a switch happened

## Proposed flow
1. **Requester** taps video icon → no local camera turned on yet. Sends a "video upgrade request" signal to the other participant and shows a small waiting state ("Waiting for [Name] to accept video…") with a Cancel option.
2. **Recipient** sees an in-call prompt: *"[Name] wants to switch to video"* with **Accept** / **Decline** buttons.
3. On **Accept**: both sides publish their local video tracks, `isVideo` flips to `true` on both, UI switches to fullscreen video layout.
4. On **Decline** or timeout (20s): requester sees toast "Request declined" / "No response", call stays voice-only.
5. Either side can later toggle their own camera off via the existing video button; if both turn cameras off, call returns to voice UI.

## Transport for the signal
Use the existing Supabase Realtime channel that's already open per call (`call-${callId}`) by extending it with **broadcast** events (no DB writes needed, no schema change):
- `video-upgrade-request` { fromUserId }
- `video-upgrade-response` { accepted: boolean, fromUserId }
- `video-upgrade-cancel` { fromUserId }

This piggybacks on the existing channel subscription, so no new tables, no edge function, no migration.

## Files to change
- **`src/pages/CallScreen.tsx`**
  - Replace `upgradeToVideo()` body: send broadcast request, set local state `upgradeRequest: 'outgoing' | null`
  - Add broadcast listeners on the existing call channel
  - Add `acceptVideoUpgrade()` / `declineVideoUpgrade()` handlers that publish local video and broadcast response
  - Add 20s timeout for outgoing request
  - Pass `upgradeRequest` state + handlers to a new prompt component
- **`src/components/call/CallControls.tsx`**
  - When `upgradeRequest === 'outgoing'`, show video button in a "pending" state (spinner) and allow cancel
- **`src/components/call/VideoUpgradePrompt.tsx`** (new, small)
  - Incoming-request banner overlay with Accept / Decline buttons, auto-dismiss on timeout
- **`src/pages/CallScreen.tsx`** render: mount the prompt above `CallControls` when `upgradeRequest === 'incoming'`

## Edge cases handled
- Requester hangs up while waiting → cancel broadcast sent on cleanup
- Recipient already has camera permission denied → decline auto-sent with reason, requester sees "Other party can't enable video"
- Both tap upgrade simultaneously → lowest userId wins as requester, other's request auto-accepts
- Network blip during handshake → 20s timeout cancels cleanly, call continues as voice

## Out of scope
- Downgrade-to-voice consent (either party can already mute their own video unilaterally — keep that)
- Changes to ringing/accept flow for new calls
- Any backend, migration, or edge function work — this is entirely client-side over the existing realtime channel

## Note on backend
Acknowledged: backend stays on `pnpabtxvsrkrldpfmtaz.supabase.co`. This change requires **no** backend modifications, so no risk to the Supabase swap.
