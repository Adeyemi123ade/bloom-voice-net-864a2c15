# Continue with Google

## How it works

| Where | How |
| --- | --- |
| Website (any browser) | Supabase sends the page to Google and back to `/auth/google-return` (`src/lib/googleAuth.ts`). |
| Android app, APK 1.10 and later | Android's own Google account picker (`ChiChatGooglePlugin.java`, Credential Manager). Google returns a signed ID token; the app passes it to `supabase.auth.signInWithIdToken` with a nonce. No browser, no one-time code. |
| Android app, older APKs | Browser fallback: Google runs in a browser tab that hands the result back to the app (`src/lib/appGoogleHandoff.ts`, `GoogleOAuthReturnListener.tsx`). |

After sign-in, `/auth/google-return` asks `check-google-signup`: an account
with a phone number goes to the chats; a new one goes to `/register` with its
Google name and email filled in, adds phone and password, and finishes with
`complete-google-registration`.

## Why the native picker

On Android the browser flow failed at Supabase with "Unable to exchange
external code" (seen in `app_errors`): the one-time code from Google could not
be used to finish the sign-in. The native picker does not use that code at
all, which removes the failing step.

## One-time setup (Google Cloud Console)

In the same project as the web client
`293491364977-tjb6vl7f5nkej0ed8ogf6kj4eikc8c4d.apps.googleusercontent.com`:

1. APIs & Services, Credentials, Create credentials, OAuth client ID, type **Android**.
2. Package name `com.bloomvoicenet.chat`.
3. SHA-1 of the key that signs the APK. Add one Android client per key:
   - debug builds: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
   - release builds: `keytool -list -v -keystore /path/to/chichat-upload.jks -alias chichat-upload`
   - after Google Play: the "App signing key certificate" SHA-1 from Play Console, App integrity.
   (Android Studio: Gradle panel, app, Tasks, android, signingReport shows them too.)

Nothing to copy back into the code: the app asks for a token for the web
client above, which is the client Supabase already uses. Supabase needs no
change (Authentication, Providers, Google keeps the web client id; leave
"Skip nonce check" off).

## When it doesn't work

If the Android client is missing, or its package name or SHA-1 doesn't match
the key that signed the installed APK, Google shows the account picker, the
person picks an account, and the picker closes with
`GetCredentialCancellationException: [16] Account reauth failed`. That is a
*cancellation* type, the same as the person closing the picker, so the app
used to stop silently with no record.

Now:
- Every picker failure, cancellations included, is recorded in `app_errors`
  (kind `google-native`, e.g. `cancelled after 3.1s: ...`).
- APK 1.10+ (this plugin version) sends `setup` for these, and the screen
  says Google sign-in isn't set up for this version, with Google's reason.
- Failures no longer fall back to the browser (that path is what failed on
  Android before); the screen explains instead. Only APKs without the picker
  use the browser.
- logcat tag `ChiChatGoogle` has the full exception.

Check, in this order: the Android client is in the SAME Google Cloud project
as the web client above; package name exactly `com.bloomvoicenet.chat`; SHA-1
equals the key of the APK on the phone (Android Studio Run/Build APK = the
laptop's debug key; signed release = upload key; Play = app signing key);
Google needs a few minutes after a change.

## Seen on 2026-10-22: "Unable to exchange external code"

Google sign-in failed on the website and the Android app while email
sign-in worked. Cause: the Client Secret saved in Supabase (Authentication,
Providers, Google) had an extra space, so Supabase could not swap Google's
code for a token. Fixed by pasting the secret again with no spaces. If this
error appears again, check that field first: Client ID
`293491364977-tjb6vl7f5nkej0ed8ogf6kj4eikc8c4d.apps.googleusercontent.com`,
secret copied exactly from that web client in Google Cloud.

## Google Contacts (website only)

Contacts, "Import from Google" (`src/lib/googleContacts.ts`). Not in the
Android app, which reads the phone's own contacts.

How it works: the browser loads Google's sign-in script, Google asks the
person to share their contacts (read only, scope
`https://www.googleapis.com/auth/contacts.readonly`) using the same web
client as sign-in, and the browser reads names and numbers from the People
API (`people/me/connections`). The list is kept in that browser only (like
the phone book on Android, cleared on sign-out) and checked against ChiChat
with `match_contacts_by_phone`. No access pass, contact or number is stored
on ChiChat's servers. The old server functions `google-oauth-callback`,
`google-contacts-sync` and `google-contacts-create` are not used.

One-time setup in Google Cloud, same project as the web client:

1. APIs & Services, Library: enable **Google People API**.
2. OAuth consent screen (Google Auth Platform), Data access: add the scope
   `.../auth/contacts.readonly`. It is a sensitive scope: Google reviews it
   separately from sign-in, even when the app is already verified. Until it
   is approved, people see an "unverified app" warning and the app is capped
   at 100 people for this scope.
3. Credentials, the web client, Authorized JavaScript origins:
   `https://www.chichatapp.com` and `https://chichatapp.com`. Vercel preview
   links only work if their exact address is added here too.

If something is missing, the person sees "Couldn't load your Google contacts"
and the reason is saved in `app_errors` (kind `google-contacts`).

