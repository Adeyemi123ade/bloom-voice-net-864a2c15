# Examples

All examples hit **production**. Use a test account. Values in angle
brackets are placeholders; never paste real tokens into docs, issues or chat.

```bash
export FN=https://pnpabtxvsrkrldpfmtaz.supabase.co/functions/v1
export ANON=<public key from src/integrations/supabase/client.ts>
export TOKEN=<test account access token, see authentication.md>
```

## From the app (how ChiChat itself calls them)

The Supabase SDK adds the headers and always uses POST:

```ts
import { supabase } from "@/integrations/supabase/client";

const { data, error } = await supabase.functions.invoke("check-email-exists", {
  body: { email: "person@example.com" },
});
// data: { exists: false, deleted: false }
```

A non-2xx status arrives as `error` (a `FunctionsHttpError`); read the body
with `await error.context.json()`.

## Public endpoint

```bash
curl -s "$FN/check-email-exists" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"email":"person@example.com"}'
# {"exists":false,"deleted":false}
```

## Signed-in endpoint

```bash
curl -s "$FN/request-device-otp" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"test-device-1","platform":"web","dry_run":true}'
# {"reason":"new_device","other_display_name":null}
```

`dry_run: true` only reports the reason; no email is sent.

## Errors

```bash
curl -s -i "$FN/agora-token" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roomName":"ag-not-my-call"}'
# HTTP/2 403
# {"error":"Unauthorized"}
```

```bash
curl -s "$FN/twilio-voice-token" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -X POST
# 200 {"blocked":"too_new"}   for an account under 24 hours old
```

## Voice note transcription

Raw audio:

```bash
curl -s "$FN/transcribe-voice" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: audio/webm" --data-binary @note.webm
# {"text":"See you at six.","model":"…","timings":{…}}
```

A note already sent (path inside the `chat-media` bucket):

```bash
curl -s "$FN/transcribe-voice" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"<sender id>/<conversation id>/<timestamp>.webm"}'
```

Each call costs money and counts toward 30 per hour.

## Invite page

```bash
curl -s https://www.chichatapp.com/i/Sulaimon | grep og:title
# <meta property="og:title" content="Sulaimon invited you to ChiChat">
```

## Do not run against production

- `delete-account`: permanently deletes the account.
- `chat-restore`: writes messages.
- `send-call-push`: rings or notifies real phones.
- `twilio-room` `create`: creates a billable Twilio room.
- `process-email-queue`, `twilio-voice-twiml`: not for manual calls.
