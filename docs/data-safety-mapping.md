# Google Play Data Safety — SportMind AI

Internal reference for filling out the Play Console "Data safety" form. Not user-facing (the public
policy is `docs/privacy-policy.html`). **This file does not submit anything**: the form is filled in
by a person in Play Console, and the live policy page is published separately.

Package `com.onurfatihgunes.sportmindai`. Re-audited against commit `23d9e6c` (October 2026) with
`PURCHASES_ENABLED = false`. Each row names the code or test that backs it and says how it can be
re-checked. Play's category names change; treat the "Play data type" column as the closest current
match and re-read it against the live form.

"Collected" follows Play's definition: data transmitted off the device, to us or to anyone else, other
than data processed only transiently in memory. Data kept only in local storage is **not** collected.

## What the app actually does on the network

Exactly two kinds of outbound traffic exist in the shipped app:

| Destination | What is sent | Evidence / how to re-check |
|---|---|---|
| Our Supabase project (anon, read-only PostgREST queries) | Table filters (match ids, team ids, dates). No name, account, device or advertising identifier. The host necessarily sees connection metadata (IP address, time). | `lib/supabase.ts` (`persistSession: false`, anon key), `data/liveData.ts`. Re-check: run the app behind a proxy / read `adb logcat` network logs. |
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
| `react-native-purchases` (RevenueCat, includes the Play Billing client) | Yes — kept deliberately | **No.** Never configured while the flag is off; no key in the EAS production environment. | `com.android.vending.BILLING` is removed from the manifest (`app.json` → `blockedPermissions`, see `docs/release-permissions.md`). **If purchases return, this section and the form change** (purchase history, device/user ID via RevenueCat). |
| `@supabase/supabase-js` | Yes | Yes | Read-only anon client. |
| Analytics / ads / crash reporting (Firebase, Sentry, Amplitude, AdMob …) | No | — | Absent from `package.json`. `@opentelemetry/api` is an unused transitive dependency (no import in app code). |

## Data safety form — proposed answers

| Play data type | Collected | Shared | Purpose | Notes |
|---|---|---|---|---|
| Personal info (name, email, address, phone, other) | No | No | — | Display name is typed by the user and stored only locally (`contexts/ProfileContext.tsx`). No accounts exist. |
| Financial info / purchase history | No | No | — | No payment or purchase feature is reachable. |
| Location | No | No | — | No location API or permission. |
| Photos, videos, audio, files, contacts, calendar | No | No | — | No such APIs; storage permissions are blocked. |
| Messages, web browsing history | No | No | — | — |
| App activity (interactions, search history, installed apps) | No | No | — | Watchlist / followed teams / searches stay local (`contexts/WatchlistContext.tsx`, `contexts/FollowedTeamsContext.tsx`). |
| App info and performance (crash logs, diagnostics) | No | No | — | No crash SDK. Google Play's own Android vitals are collected by Google, not by the app. |
| Device or other IDs | No | No | — | No identifier is created or sent. A token minted by *earlier test builds* may remain in local storage (`sportmind.onurai.anonymous_session`); this version neither reads nor sends it. |
| Data encrypted in transit | Yes | | | All requests are HTTPS (Supabase). |
| Data deletion request | Not applicable | | | No accounts. Local data: Profile → Clear My Data, or uninstall. |

### Items that need a human decision before the form is submitted
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
| `sportmind_appearance_mode` | Light/Dark/System | No (uninstall) |
| `sportmind_has_seen_welcome` | First-run flag | No (uninstall) |
| `sportmind.onurai.anonymous_session`, `sportmind_device_id`, `sportmind_local_trial_started_at`, `sportmind_legacy_trial_migration_v1` | Only present on devices that ran earlier test builds; not read or sent by this version | No (uninstall) |

## Account deletion requirement

Applies only to apps that support account creation. SportMind AI has none (no sign-in code in `app/` or
`contexts/`), so no in-app account-deletion path or deletion URL is required.
