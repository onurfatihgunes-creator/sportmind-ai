# Google Play Data Safety — SportMind AI

Internal reference for filling out the Play Console "Data safety" form. Not user-facing (the public
policy is `docs/privacy-policy.html`). **This file does not submit anything**: the form is filled in
by a person in Play Console, and the live policy page is published separately.

Package `com.onurfatihgunes.sportmindai`. Audited against commit `23d9e6c` (October 2026) with
`PURCHASES_ENABLED = false`, then **updated in November 2026 for Google AdMob** (`ADS_ENABLED = true`,
`react-native-google-mobile-ads` 16.5.0): the earlier "no ads, nothing collected" answers no longer
hold, and the rows below say what changed. Each row names the code or test that backs it and says how it can be
re-checked. Play's category names change; treat the "Play data type" column as the closest current
match and re-read it against the live form.

"Collected" follows Play's definition: data transmitted off the device, to us or to anyone else, other
than data processed only transiently in memory. Data kept only in local storage is **not** collected.

## What the app actually does on the network

Exactly three kinds of outbound traffic exist in the shipped app:

| Destination | What is sent | Evidence / how to re-check |
|---|---|---|
| Our Supabase project (anon, read-only PostgREST queries) | Table filters (match ids, team ids, dates). No name, account, device or advertising identifier. The host necessarily sees connection metadata (IP address, time). | `lib/supabase.ts` (`persistSession: false`, anon key), `data/liveData.ts`. Re-check: run the app behind a proxy / read `adb logcat` network logs. |
| Google AdMob (`googleads.g.doubleclick.net`, `pagead2.googlesyndication.com` and Google consent hosts) | Sent by the Google Mobile Ads SDK, not by our code: IP address, user product interactions (ad views/taps), diagnostics, and device/account identifiers (Android advertising ID, app set ID). Nothing from the app's own local data. Requested only after consent allows it. | `services/ads/adsRuntime.ts` (consent first, then `mobileAds().initialize()`), `components/AdBanner.tsx`. Google's own table: https://developers.google.com/admob/android/privacy/play-data-disclosure (checked November 2026, SDK 25.5.0). Re-check: run the app behind a proxy. |
| `onurfatihgunes-creator.github.io` (privacy policy, terms) | Only when the person taps the link on the Legal screen; opens in the system browser, outside the app. | `app/legal/index.tsx`. |

**No request goes to the OnurAI/Vera backend.** With `PURCHASES_ENABLED = false`,
`services/entitlement.ts` returns before any request and mints no session token, `EntitlementProvider`
never refreshes, and RevenueCat is never configured. Proof: `services/purchasesDisabled.test.ts`
asserts `onuraiApi`, `ownerToken`, `Purchases.configure/getOfferings/getCustomerInfo/purchasePackage/restorePurchases`
are never called, even with a key present. The sports-data providers (football-data.org, balldontlie.io,
RapidAPI Football, BSD) are called only by our GitHub Actions backend (`backend/src/*`), never by the app.

## SDKs in the build

| SDK | Present | Active in this release | Notes |
|---|---|---|---|
| `react-native-google-mobile-ads` (Google Mobile Ads SDK + UMP consent SDK) | Yes | **Yes**, after the consent step. Banners on Home and Match Analysis; an interstitial after closing a Match Analysis (paced by `services/ads/interstitialPolicy.ts`). | Adds the advertising-ID permission (`com.google.android.gms.permission.AD_ID`) to the merged manifest. Content level capped at PG in code; betting/gambling ads must also be blocked in the AdMob console (`docs/admob-setup.md`). `delayAppMeasurementInit` is on, so the SDK sends nothing before consent. |
| `react-native-purchases` (RevenueCat, includes the Play Billing client) | Yes — kept deliberately | **No.** Never configured while the flag is off; no key in the EAS production environment. | `com.android.vending.BILLING` is removed from the manifest (`app.json` → `blockedPermissions`, see `docs/release-permissions.md`). **If purchases return, this section and the form change** (purchase history, device/user ID via RevenueCat). |
| `@supabase/supabase-js` | Yes | Yes | Read-only anon client. |
| Analytics / crash reporting (Firebase, Sentry, Amplitude …) | No | — | Absent from `package.json`. `@opentelemetry/api` is an unused transitive dependency (no import in app code). AdMob is the only third-party SDK that sends data (row above). |

## Data safety form — proposed answers

| Play data type | Collected | Shared | Purpose | Notes |
|---|---|---|---|---|
| Personal info (name, email, address, phone, other) | No | No | — | Display name is typed by the user and stored only locally (`contexts/ProfileContext.tsx`). No accounts exist. |
| Financial info / purchase history | No | No | — | No payment or purchase feature is reachable. |
| Location → Approximate location | **Yes** (AdMob: IP address used to estimate the general location) | **Yes** (Google) | Advertising or marketing; Analytics; Fraud prevention, security, and compliance | No location API or permission in the app itself; this is the SDK's IP-derived estimate. |
| Photos, videos, audio, files, contacts, calendar | No | No | — | No such APIs; storage permissions are blocked. |
| Messages, web browsing history | No | No | — | — |
| App activity → App interactions | **Yes** (AdMob: ad views, taps, app launch) | **Yes** (Google) | Advertising or marketing; Analytics; Fraud prevention, security, and compliance | Only what the ads SDK collects. Watchlist / followed teams / searches stay local and are never sent (`contexts/WatchlistContext.tsx`, `contexts/FollowedTeamsContext.tsx`). |
| App info and performance → Diagnostics | **Yes** (AdMob: app launch time, hang rate, energy usage) | **Yes** (Google) | Analytics; Fraud prevention, security, and compliance | No crash-reporting SDK of our own. Crash logs: No. Google Play's own Android vitals are collected by Google, not by the app. |
| Device or other IDs | **Yes** (AdMob: Android advertising ID, app set ID) | **Yes** (Google) | Advertising or marketing; Analytics; Fraud prevention, security, and compliance | Our own code creates and sends no identifier. A token minted by *earlier test builds* may remain in local storage (`sportmind.onurai.anonymous_session`); this version neither reads nor sends it. |
| Data encrypted in transit | Yes | | | All requests are HTTPS (Supabase); Google states the ads SDK's data is TLS-encrypted. |
| Data deletion request | Not applicable | | | No accounts. Local data: Profile → Clear My Data, or uninstall. Data held by Google: the person can reset or delete the advertising ID in Android Settings → Google → Ads. |

The other categories (personal info, financial info, photos/files, messages, contacts, calendar,
web browsing history, health, audio) stay **No**: neither our code nor the ads SDK collects them.
Play asks, per type, whether collection is "required or optional": the ad ID can be reset by the
person and ad personalisation turned off, so **VERIFY** in the console what Google's current wording
expects before choosing; this file does not decide it.

### Items that need a human decision before the form is submitted
0. **Declare ads everywhere they are asked.** Play Console → App content → *Ads*: **Yes, my app contains
   ads**. *Advertising ID*: **Yes**, used for advertising. Target audience must not include children
   (recommend 18+ or 13+; see `docs/play-console-checklist.md`). The Data safety answers above must
   match the privacy policy section "Advertising (Google AdMob)".
1. **IP address / request metadata at Supabase.** Play treats data that is sent to a server and *stored*
   as collected. Supabase's own access logs and retention for this project are not visible from this
   repository. Decide, after checking the Supabase project's log settings, whether to declare
   "Approximate location / IP address — collected, not shared, app functionality" or to rely on the
   transient-processing exemption. **Not assumed either way.**
2. **Play Console's treatment of a bundled but inactive billing SDK.** Whether the console still asks
   billing-related questions for an AAB that contains `react-native-purchases` without the BILLING
   permission can only be seen in the console.
3. **Content rating / "Contains in-app purchases" label.** There are no in-app products; confirm the
   store listing shows none.

## Local-only storage (not "collected")

| Key | Holds | Cleared by Clear My Data |
|---|---|---|
| `sportmind_profile_name` | Display name | Yes |
| `sportmind_watchlist_match_ids` | Saved matches | Yes |
| `sportmind_followed_team_ids` | Followed teams | Yes |
| `sportmind-ai-language` | Language | Yes |
| `sportmind_notification_prefs` | Toggle states (no push delivery exists) | Yes |
| `sportmind_appearance_mode` | Light/Dark/System | Yes |
| `sportmind_has_seen_welcome` | First-run flag | Yes |
| `sportmind.onurai.anonymous_session`, `sportmind_device_id`, `sportmind_local_trial_started_at`, `sportmind_legacy_trial_migration_v1` | Only present on devices that ran earlier test builds; not read or sent by this version | No (uninstall) |

## Account deletion requirement

Applies only to apps that support account creation. SportMind AI has none (no sign-in code in `app/` or
`contexts/`), so no in-app account-deletion path or deletion URL is required.
