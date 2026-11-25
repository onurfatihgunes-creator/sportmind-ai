# Play Console launch checklist — SportMind AI

Package `com.onurfatihgunes.sportmindai` · versionName 1.0.0 · Expo SDK 54 / RN 0.81 · target SDK 36.

This file is a checklist and a set of **proposed** answers. It submits nothing. Every form in Play
Console is filled in and sent by a person. Items marked **OWNER** need a decision or an action that only
the account owner can take; items marked **VERIFY** can only be checked inside the console.

Status key: ✅ done and verified · 🟡 drafted, needs approval · ⛔ blocked on the owner.

---

## 0. Things that can delay the launch (read first)

| # | Item | Why it matters |
|---|---|---|
| 0.1 | **Account type — OWNER** | Personal developer accounts created after 13 Nov 2023 must run a **closed test with at least 12 opted-in testers for 14 continuous days** before they can apply for production access. Organisation accounts are reportedly exempt. Check *Play Console → Account details* for the account type. If it is personal, the launch date is at least ~14 days after the closed test starts. Rules change; re-read the current Play Help page before relying on this. |
| 0.2 | **Physical-device test (Galaxy A13) — OWNER** | Pending since Phase 3. Automated and emulator checks do not replace it. |
| 0.3 | **Privacy policy must be live before the Data safety form** | The October 2026 text is live and says there are no ads. The version that describes Google AdMob (November 2026) must be pushed **before** an ads build is released or the Data safety form is submitted. Pushing `docs/` to `main` publishes it. Needs explicit owner approval. |
| 0.4 | **Supabase IP/log retention decision — OWNER** | Needed to answer one Data safety question honestly (section 5). |
| 0.5 | **Developer verification** | Play may ask the owner for identity/address verification. Cannot be done from the repo. |
| 0.6 | **AdMob account and real ad units — OWNER** | The build uses Google's test App ID and test ad units until the owner creates the AdMob app and three ad units. A build with test ads must **never** be uploaded. Full list in `docs/admob-setup.md`. |
| 0.7 | **Betting/gambling ads — OWNER** | The listing says "not betting". Block the *Gambling & games* sensitive category (and betting advertisers) in AdMob → Blocking controls before release. |

## 1. Build and signing

| Item | State | Notes |
|---|---|---|
| Target API 36 | ✅ | New apps/updates must target API 36 from 31 Aug 2026; the app does. |
| 16 KB page-size alignment | ✅ | Checked on the RC APK: `zipalign -P 16` passes; 20 arm64-v8a `.so` files with PT_LOAD alignment ≥ 16 KB. **Re-check on the final AAB.** |
| Permissions | 🟡 | Before ads: `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE` only. The ads build adds `AD_ID` (and the SDK's `WAKE_LOCK` / ad-services permissions); BILLING, storage and overlay stay blocked in `app.json` (`docs/release-permissions.md`). **Re-run `aapt2 dump permissions` on the final artefact.** |
| Upload format | ✅ | **Release AAB:** `.build-artifacts/sportmind-ai-release-vc14.aab` (versionCode 14, commit `bf81008`, git-ignored; SHA-256 `f1fcb752…c2c383`). Real AdMob App ID `ca-app-pub-7375166678641193~3124915148` in the manifest and the three real ad unit IDs in the JS bundle; 16 KB alignment (40/40 64-bit libs) and permissions re-checked (same set as vc13). vc13 (test ads) and vc10/vc11 (no ads) must **not** be uploaded. |
| `distribution: "internal"` on the `production` profile | 🟡 | EAS marks the build as internal distribution; it does not stop the AAB being uploaded to Play. Optional tidy-up: remove it or leave it — the owner decides; changing `eas.json` needs a commit. |
| versionCode | ✅ | `appVersionSource: remote`. Production AAB built as **versionCode 10** (EAS build `79dad4fb-6053-4e6c-9054-a4da88adfcb3`, commit `85b6756`); the smoke-test APK (`0961e420-24fd-43de-b886-8cbf4767ec7e`) has the same code. The next production build will be 11. Play rejects a versionCode it has already seen. |
| App signing | ⛔ OWNER | Use **Play App Signing** (default). EAS holds the upload keystore ("Build Credentials sKxcGA1wIc", remote managed). Keep that credential: download or note it in EAS only if the owner chooses to — **no backup is made by the assistant**. Losing the upload key is recoverable through Play support, but slow. |
| Build approval | ⛔ OWNER | No AAB or APK is built without an explicit request for that specific build. |

## 2. Store listing

| Item | State | Where |
|---|---|---|
| App name, short and full description, release notes — EN / TR / DE / AR | 🟡 | `docs/store-listing.md` (lengths checked: short ≤ 76/80, full ≤ 1891/4000) |
| App icon 512×512 | ✅ | `docs/store-assets/icon-512.png` |
| Feature graphic 1024×500 (EN, TR) | 🟡 draft | `docs/store-assets/feature-graphic-{en,tr}.png` — **OWNER must approve** |
| Phone screenshots (2–8 per language) | 🟡 | Retaken from the final versionCode-10 APK: 6 per language × EN/TR/DE/AR, all 1080×1920, in `docs/store-assets/screenshots/{en,tr,de,ar}/`. German casing and the Arabic active-tab pill are verified fixed on the final build. Owner to look through them. |
| Category | 🟡 | **Sports** |
| Contact email | ⛔ OWNER | Shown publicly. The policy and support page currently use `onurfatihgunes@gmail.com`. Use one address everywhere. |
| Contact website | 🟡 | `https://onurfatihgunes-creator.github.io/sportmind-ai/support.html` (200). **Must be filled in** (Store settings → Store listing contact details → Website): AdMob reads it from the Play listing and looks for app-ads.txt at the root of that host. Keep this page rather than the bare root, which is a 404. |
| app-ads.txt | ✅ live / ⏳ AdMob | `https://onurfatihgunes-creator.github.io/app-ads.txt`: 200, `text/plain`, no redirect, one line `google.com, pub-7375166678641193, DIRECT, f08c47fec0942fa0` (publisher matches the app ID; checked 25 Nov 2026). AdMob can verify it only after the app is **public on Play** and **linked** in AdMob (App settings → Link to store); crawl takes ≥24 h. Until review/linking AdMob serves limited ads. |
| Privacy policy URL | ✅ | `https://onurfatihgunes-creator.github.io/sportmind-ai/privacy-policy.html` (live, includes the AdMob section) |
| Tablet / Chromebook / Wear screenshots | Optional | Skip. The app is portrait phone-first. |

## 3. App content declarations (proposed answers)

| Declaration | Proposed answer | Basis |
|---|---|---|
| **App access** | All functionality available without sign-in or special access | No accounts in the app. |
| **Ads** | **Yes, the app contains ads** | Google AdMob (`react-native-google-mobile-ads`): banners on Home and Match Analysis, an interstitial after closing a Match Analysis. Not optional: the *Contains ads* label must match. |
| **Content rating (IARC)** | See 3.1 | |
| **Target audience and content** | **Not designed for children.** Choose 13+ or 18+ only; recommended **18+** (see 3.2) | Avoids the Families policy; the content is close to gambling-adjacent subject matter even though the app is not gambling. **OWNER decides.** |
| **News apps** | Not a news app | |
| **COVID-19 / government / health / financial features** | No / No / No / No | None of these exist in the app. |
| **Data safety** | See `docs/data-safety-mapping.md` and section 5 | |
| **Advertising ID** | **Yes**, the app uses the advertising ID, for advertising | The Google Mobile Ads SDK adds `com.google.android.gms.permission.AD_ID`. **VERIFY** it appears in the merged manifest of the final AAB and that the console declaration matches it. |
| **Gambling** | Not a gambling app; no real-money gambling, no odds, no wagering | The listing says so in plain words. |
| **Account deletion** | Not applicable (no accounts) | `docs/data-safety-mapping.md` |

### 3.1 IARC questionnaire — draft answers
Category: pick the closest to a reference/information app (the console shows the exact label; **VERIFY**).
Answer **No** to all of: violence, blood, sexual content or nudity, profanity, controlled substances,
crude humour, horror/fear, user-generated content, user-to-user communication, sharing of location,
digital purchases, **gambling or simulated gambling**. Expected result: lowest rating for every region.
The questionnaire is answered by a person in the console; this is only the draft.

### 3.2 Target audience
Recommended: **18+**. If the owner prefers 13+, no further declarations are needed beyond the above, but
the Families policy is avoided only if no age group under 13 is selected. The app now shows ads, so it
must never be listed as child-directed (AdMob would then also need child-directed treatment).

## 4. Closed testing → production (only if the account is personal)

1. Create a closed testing track, upload the AAB, add a tester list (Google Group or email list), at
   least **12** testers, and have them opt in via the link.
2. Keep the test running **14 continuous days** with ≥ 12 testers opted in at all times.
3. Apply for production access in the console, answering the questions about testing honestly.
4. Prepare for a review of up to several days.

The testers must be real people the owner can reach; the assistant cannot supply them.

## 5. Data safety — items still needing the owner

Proposed answers are in `docs/data-safety-mapping.md`: no data collected, none shared, encrypted in
transit, no account, nothing to delete. Three decisions remain:

1. **IP address / request metadata at Supabase.** Check the Supabase project's log settings and decide
   whether to declare IP address as collected (not shared, app functionality) or rely on the transient
   processing exemption. Not assumed either way.
2. **Bundled but inactive billing SDK.** `react-native-purchases` is in the build but never configured
   and without the BILLING permission. See whether the console asks billing questions for the AAB.
3. **"Contains in-app purchases" label.** There are no products; confirm the listing shows none.

## 6. Pre-submission verification on the final artefact (needs explicit permission to run)

These are runs, so they are **not started** until the owner says so, and each is the smallest set that
gives confidence:

- Type check (`tsc`) — compiles the changed files (SegmentedControl RTL, German casing).
- Focused Jest tests: `data/kickoffLabel.test.ts` (new `factorInSentence` cases) and the existing suite
  for anything touching Home.
- On the final AAB/APK: `aapt2 dump permissions`, `zipalign -P 16 -c -v`, versionCode/versionName,
  package name.
- Emulator smoke test of the final APK in all four languages, including the **Arabic active-tab pill**
  (the RTL fix is not yet runtime-verified) and the **German** Home sentence.
- Physical-device test on the Galaxy A13 (owner).

## 7. Release steps (all by the owner, in this order)

1. Approve the code changes and store assets → commit.
2. Approve publishing the privacy policy → push `docs/` to `main`; open the policy URL in a browser and
   read it.
3. Approve one production AAB build (plus a production-APK for the smoke test and screenshots).
4. Run section 6.
5. Retake screenshots from the final build into `docs/store-assets/screenshots/{en,tr,de,ar}/`.
6. Fill Play Console: listing, content declarations, Data safety, contact details.
7. Internal testing track (instant, ≤ 100 testers) as a last install check from the Play Store itself.
8. Closed test (if required, section 4) → production, with a staged rollout (e.g. 20 %) for the first
   release.

## 8. Things deliberately left alone

- `PURCHASES_ENABLED` stays `false`; RevenueCat code is kept.
- No production database writes, no new paid APIs or providers.
- No real third-party team logos (text-only team avatars).
- Nothing is published, pushed or submitted by the assistant.
