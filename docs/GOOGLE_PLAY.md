# ChiChat: Google Play submission pack

Prepared 2026-10-21. Answers describe what the app does today; if a feature changes, update the Data safety form too. Google's forms change from time to time, so read each question as you go.

## 1. Links Play asks for
| Field | Value |
|---|---|
| Privacy policy URL | https://www.chichatapp.com/privacy |
| Account deletion URL | https://www.chichatapp.com/delete-account |
| Terms (and child safety standards) | https://www.chichatapp.com/terms (section "Child Safety") |
| Child safety contact | techpath411@gmail.com |
| Support email on the store listing | techpath411@gmail.com |

## 2. App content forms
- **Ads:** No ads.
- **App access:** Sign-in required. Give reviewers two test accounts (email and password each), so they can test a call between them. Dial pad calls to phone numbers are available only 24 hours after an account is created, and only to Nigeria and UAE numbers, so create the reviewer accounts at least a day before submitting.
- **Content rating (IARC questionnaire):** Category: Social / communication. Users can interact and exchange messages, photos and voice: Yes. Shares user location: No. Digital purchases: No. Unrestricted internet access: No. Expect a teen-or-higher rating.
- **Target audience:** 13 and over, matching the Terms ("at least 13"). Don't tick any under-13 age group (that brings in the Families policy).
- **News app:** No. **Health:** No. **Financial features:** None. **Government app:** No.
- **Child safety standards** (required for social and communication apps): standards URL = /terms, contact = techpath411@gmail.com. In-app reporting exists (Report on a chat, a person or a message).
- **User-generated content:** the Terms forbid abusive and illegal content; in-app Report and Block exist; reports are reviewed on the admin page; accounts can be suspended.

## 3. Data safety form
Data is encrypted in transit: **Yes** (all traffic uses HTTPS/TLS).
People can request deletion: **Yes** (in the app: Settings > Account > Delete account; on the web: /delete-account).
Data sold: **No.** Data shared with third parties: **No.** Service providers that process data on ChiChat's behalf (hosting and database, real-time calling, email delivery, speech-to-text for voice transcription, sign-in and notifications) count as service providers, not sharing, under Play's definition.

| Data type (Play's name) | Collected | Required or optional | Purpose |
|---|---|---|---|
| Name | Yes | Required | Account management, App functionality |
| Email address | Yes | Required | Account management, App functionality |
| Phone number | Yes | Required | Account management, App functionality (friends find you) |
| User IDs | Yes | Required | Account management, App functionality |
| Other in-app messages (chats) | Yes | Required | App functionality |
| Photos | Yes | Optional (only if you send or set one) | App functionality |
| Videos | Yes | Optional | App functionality |
| Voice or sound recordings | Yes | Optional (voice notes; calls are not recorded) | App functionality |
| Files and docs | Yes | Optional | App functionality |
| Contacts | Yes | Optional (only if you import phone contacts) | App functionality (show which contacts use ChiChat) |
| Other user-generated content (feedback, reports) | Yes | Optional | App functionality, Fraud prevention / security |
| Crash logs | Yes | Required (automatic) | Analytics (app stability) |
| Diagnostics | Yes | Required (automatic) | Analytics (app stability) |
| Device or other IDs (push token, device ID) | Yes | Required | App functionality (notifications, sign-in security) |
| Location, financial info, health, web browsing, calendar | No | | |

Calls: audio and video are carried live by the calling providers and are not recorded. Call times and durations are stored as call history.

## 4. Permission declarations
| Permission | Why ChiChat needs it | Play form |
|---|---|---|
| USE_FULL_SCREEN_INTENT | Shows the incoming call screen when the phone is locked. ChiChat is a calling app. | Full-screen intent declaration: "Calling". |
| FOREGROUND_SERVICE_MICROPHONE | Keeps an ongoing voice or video call running when the screen is off or another app is open. | Foreground service declaration, with a short video of a call continuing in the background. |
| FOREGROUND_SERVICE_MEDIA_PLAYBACK | Plays the ringtone for an incoming call while ChiChat is closed. | Foreground service declaration. **Risk:** Google may say ringing isn't media playback (see open question 2). |
| RECORD_AUDIO, CAMERA | Voice notes, voice and video calls. | Normal runtime permissions. |
| READ_CONTACTS / WRITE_CONTACTS | Read: show which contacts use ChiChat. Write: "Save to phone book" when adding a new contact. | Explain in the listing and Data safety; asked only when the person taps import or save. |
| POST_NOTIFICATIONS | Message and call notifications. | Normal runtime permission. |
| REQUEST_IGNORE_BATTERY_OPTIMIZATIONS | **Removed** (Play doesn't allow it for apps using Firebase). The app explains the battery setting and opens the phone's list instead. | Nothing to declare. |

## 5. Release build
- Release signing is set up in `android/app/build.gradle`. It reads `android/keystore.properties`, which stays on the build laptop and never goes into git.
- Make the upload key once, on the laptop, and back it up in two places. If it's lost, the app can't be updated.
- Build an Android App Bundle: Android Studio > Build > Generate Signed App Bundle / APK > Android App Bundle. Version 1.9 (versionCode 10). Every upload needs a higher versionCode.
- Turn on Play App Signing when asked (Google keeps the final signing key; you keep the upload key).

## 6. Testing track (personal developer account)
- Closed test with at least 12 testers opted in for 14 days in a row, then "Apply for production" (review takes about a week). Recruit 15 to 20, because Play only counts testers who stay opted in the whole time.
- Testers join with the Google account email they use on their phone; send them the opt-in link from Play Console.
- An organisation account (with a D-U-N-S number) skips the 12-tester rule.

## Open questions
1. **Deletion by email within 7 days:** /delete-account promises that an emailed request is handled within 7 days. Confirm, or set the number of days you can keep.
2. **Ringing service type:** if Google rejects the media playback declaration for ringing, the fix is to make ringing a phone-call type, which needs a self-managed ConnectionService (a bigger Android change, then a rebuild). Recommendation: submit as is, change only if Google asks.
3. **Personal or organisation developer account?**
4. **Android crash reports:** done. Firebase Crashlytics reports native Android crashes from the first release build on (`android/app/build.gradle`). It is Google's own service, so the Data safety answers above (crash logs, diagnostics, device IDs) stay the same.
