# Google AdMob — setup and release checklist

SportMind AI shows ads through Google AdMob (`react-native-google-mobile-ads` 16.5.0, Google Mobile
Ads SDK + UMP consent SDK). The code is finished and uses **Google's test IDs** until the owner supplies
real ones. Nothing here is done in AdMob or Play Console automatically.

## What the app shows
| Placement | Where | Behaviour |
|---|---|---|
| Home banner | End of the Home scroll content | Anchored adaptive banner; collapses completely if no ad is available. |
| Match banner | End of the Match Analysis content | Same. |
| Interstitial | When a Match Analysis screen is closed (back/close) | Paced by `services/ads/interstitialPolicy.ts`: not in the first minute after launch, at least 3 analyses closed since the last one, at least 3 minutes apart, at most 4 per session. Only shows an ad that is already loaded; never waits. |

Ads start only after the first-run welcome has been seen (`app/_layout.tsx`), after Google's consent
step (`AdsConsent.gatherConsent`). Where consent is required and refused, no ad request is made.
`delayAppMeasurementInit` is on, so the SDK sends nothing before consent. The content level is capped at
PG in code. `ADS_ENABLED` in `constants/ads.ts` switches every entrance off without deleting code. On web
(`expo start --web`) every ad entry point is a no-op.

## What the owner must do (nothing below can be done from the repo)
1. **Create the AdMob account and app** (Android; iOS later). Link it to the Play Console app after the
   first upload so Google can verify ownership.
2. **Create three ad units** in AdMob: *Banner* (Home), *Banner* (Match Analysis), *Interstitial*.
3. **App ID:** put the real Android App ID (`ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX`) in `app.json` →
   `plugins` → `react-native-google-mobile-ads` → `androidAppId` (today Google's sample ID
   `ca-app-pub-3940256099942544~3347511713`). It is a manifest value, so it needs a new build.
4. **Ad unit IDs:** set these EAS environment variables for the *production* environment (they are
   public identifiers, not secrets):
   - `EXPO_PUBLIC_ADMOB_BANNER_HOME`
   - `EXPO_PUBLIC_ADMOB_BANNER_MATCH`
   - `EXPO_PUBLIC_ADMOB_INTERSTITIAL`

   Each looks like `ca-app-pub-1234567890123456/1234567890`. If one is missing or malformed the app
   falls back to Google's **test** unit for that placement (`usingTestAds()` in `constants/ads.ts`).
5. **Block betting ads.** AdMob → Blocking controls → Sensitive categories: block *Gambling & games* and
   any betting advertisers. The listing says "not betting"; the in-code PG cap does not cover this.
6. **Consent messages.** AdMob → Privacy & messaging: create and **publish** the European regulations
   (GDPR) message (and, if wanted, the US states message). Without a published message the consent form
   never appears, and ads in the EEA/UK will not serve. Optionally add the "privacy options" entry point
   (the app already shows the *Ad privacy options* row in Profile when Google says it is required).
7. **app-ads.txt** (recommended for revenue): publish it on the developer website listed in the Play
   listing. The AdMob console gives the exact line.
8. **Payments profile** in AdMob (tax and payment details) — owner-only.

## Before a build goes to Play
- [ ] Real App ID in `app.json`, real unit IDs in EAS (steps 3–4). A build that still shows test ads
      must **not** be uploaded.
- [ ] Privacy policy with the "Advertising (Google AdMob)" section is live (push `docs/`).
- [ ] Play Console: *Ads* = Yes; *Advertising ID* = Yes (advertising); Data safety updated per
      `docs/data-safety-mapping.md`; target audience not child-directed (see `docs/play-console-checklist.md`).
- [ ] `aapt2 dump permissions` of the final artefact shows `com.google.android.gms.permission.AD_ID`.
- [ ] Never tap real ads on a device that is signed in with the AdMob account (policy violation: invalid
      clicks). Use test ads / test devices.

## Testing with test ads
Google's test ad units always fill and are labelled "Test Ad". On the emulator the SDK treats the device
as a test device automatically. To exercise the consent form for a region, use
`AdsConsent.requestInfoUpdate({ debugGeography: AdsConsentDebugGeography.EEA, testDeviceIdentifiers: [...] })`
in a temporary local change; do not commit it.

## Notes
- Google marks the legacy Google Mobile Ads SDK as being in maintenance mode in favour of the GMA
  Next-Gen SDK. `react-native-google-mobile-ads` 17.x moves forward but requires React Native ≥ 0.86;
  this project is on 0.81 / Expo SDK 54, so 16.5.0 is the newest compatible release. Revisit when the
  project upgrades Expo.
- AdMob adds data collection that the app did not have before. See `docs/data-safety-mapping.md`.
