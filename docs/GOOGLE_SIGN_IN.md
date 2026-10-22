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

Without the Android client, the picker reports an error; the app then
records it in `app_errors` (kind `google-native`) and falls back to the
browser flow.
