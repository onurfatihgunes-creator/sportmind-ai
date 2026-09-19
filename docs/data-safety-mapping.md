# Google Play Data Safety — SportMind AI

Internal reference for filling out the Play Console "Data safety" form. Not
user-facing (the public Privacy Policy is `docs/privacy-policy.html`).

Derived from a code audit on 2026-09-19 (package `com.onurfatihgunes.sportmindai`).
Every row cites the file(s) that back the claim. Google Play's own category
definitions change over time — treat the "DATA TYPE" column as the closest
current match, not a guaranteed final label, and re-check against the live
Play Console form before submitting.

"COLLECTED" follows Play's definition: transmitted off the device to us or a
third party. Data that is only read/written to local device storage and never
sent over the network is **not** "collected" under that definition, even
though the app does process it locally.

| DATA TYPE | COLLECTED | SHARED | PURPOSE | OPTIONAL/REQUIRED | SOURCE IN CODE |
|---|---|---|---|---|---|
| Name (user-set display name) | NO — local only | NO | App functionality (personalization) | Optional (defaults to "Player") | `contexts/ProfileContext.tsx` (`sportmind_profile_name`, AsyncStorage only, no network send) |
| Email address | NO — never requested | NO | — | — | No auth/account code exists anywhere in the app |
| User IDs / Account IDs | NO — no accounts | NO | — | — | `services/onuraiClient.ts` header comment: "NO SIGN-IN IS ADDED... SportMind has no accounts" |
| Device or other IDs (anonymous app-installation token) | YES | NO (sent only to our own OnurAI/Vera backend, not a third party) | App functionality (trial/Pro entitlement check) | Required for entitlement checks; app fails open to "trial" if unavailable (`services/entitlement.ts` catch branch) | `services/onuraiClient.ts` (`ANON_KEY = 'sportmind.onurai.anonymous_session'`, minted via `POST /v1/sportmind/anonymous-session`, sent as `Authorization: Bearer` on `onuraiApi()` calls); `services/entitlement.ts` |
| Precise or approximate location | NO | NO | — | — | No `expo-location` or geolocation API anywhere in the codebase (verified via dependency + full-text search) |
| Photos, videos, camera | NO | NO | — | — | No `expo-camera` / `expo-image-picker` / `expo-media-library`; no camera usage description in iOS config |
| Microphone / audio | NO | NO | — | — | No audio-recording API anywhere in the codebase |
| Contacts | NO | NO | — | — | No `expo-contacts`; no contacts API usage |
| App activity (matches viewed, searches, taps) | NO | NO | — | — | Supabase reads (`lib/supabase.ts`) are anonymous public-read queries (`persistSession: false`, RLS "public read" policies) with no per-user identity attached; watchlist/followed teams stay local (`contexts/WatchlistContext.tsx`, `contexts/FollowedTeamsContext.tsx`) |
| Purchase history | NO — no purchase capability exists | NO | — | — | `services/purchase.ts`: `isPurchaseConfigured()` hardcoded `return false`; `startPurchase()`/`restorePurchases()` always return `{ ok: false, reason: 'unavailable' }`. No RevenueCat, no `react-native-iap`, no billing SDK in `package.json`. Price text on the paywall (`app/(tabs)/premium.tsx`) is informational copy only, not wired to a charge. |
| Diagnostics / crash logs | NO | NO | — | — | No Sentry/Firebase/Crashlytics/Bugsnag or any crash-reporting SDK in `package.json` or source |
| Analytics | NO | NO | — | — | No Firebase Analytics, Amplitude, Mixpanel, PostHog, or Segment in `package.json` or source. `@opentelemetry/api` is present in `package.json` but is an unused transitive dependency — no import of it anywhere in `app/`, `components/`, `contexts/`, `services/`, or `lib/` |
| Advertising ID | NO | NO | — | — | No ad SDK of any kind present |
| Language / locale preference | NO — local only | NO | App functionality | Optional | `i18n/index.ts` (`sportmind-ai-language`, AsyncStorage only) |
| Theme/appearance preference | NO — local only | NO | App functionality | Optional | `contexts/ThemeContext.tsx` (`sportmind_appearance_mode`, AsyncStorage only) |
| Notification preferences | NO — local only | NO | App functionality (UI state; no delivery system exists) | Optional | `app/notifications.tsx` (`sportmind_notification_prefs`) — explicitly documented in-code as "no push-notification delivery infrastructure exists yet" |
| Watchlisted matches / followed teams | NO — local only | NO | App functionality (personalization) | Optional | `contexts/WatchlistContext.tsx`, `contexts/FollowedTeamsContext.tsx` |

## Third-party services contacted by the app

| Service | What is sent | Why |
|---|---|---|
| Supabase (our own project) | No per-user data — anonymous public-read queries only, via a client-safe anon key (`EXPO_PUBLIC_SUPABASE_ANON_KEY`), RLS-restricted to public read | Fetch match fixtures / predictions content |
| OnurAI / Vera platform backend (`EXPO_PUBLIC_ONURAI_API_URL`) | Anonymous session bearer token only (see "Device or other IDs" row above) | Trial/Pro entitlement check |

Sports-data providers (football-data.org, balldontlie.io, RapidAPI Football,
BSD/Bzzoiro Sports Data) are called **server-side only**, by our own backend
(`backend/src/*.ts`), never directly by the app, and never with any end-user
data — they receive our backend's own API credentials and league/date query
parameters only. Listed here for completeness since the Privacy Policy
references them as the origin of match content.

## Account deletion requirement

Google Play requires an in-app account-deletion path **only for apps that
support account creation**. SportMind AI has no account system — confirmed
by the explicit "NO SIGN-IN IS ADDED" statement in `services/onuraiClient.ts`
and the absence of any auth/login code in `app/` or `contexts/`. This
requirement does not apply.

A local "Clear My Data" control exists regardless (`app/(tabs)/profile.tsx`,
`clearData()`), which removes: `sportmind_profile_name`,
`sportmind_watchlist_match_ids`, `sportmind_followed_team_ids`,
`sportmind-ai-language`, `sportmind_notification_prefs`. It does **not**
clear `sportmind_appearance_mode`, `sportmind_has_seen_welcome`, or the
anonymous entitlement token (`sportmind.onurai.anonymous_session`) — a minor
completeness gap, not a Play Store blocker, since none of those three hold
personal data (a UI preference, a boolean flag, and an anonymous token with
no PII).
