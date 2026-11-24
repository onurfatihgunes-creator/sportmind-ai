/**
 * Google AdMob configuration.
 *
 * ADS_ENABLED is the one switch: false removes every ad entrance (no consent prompt, no SDK
 * initialisation, no banner, no interstitial) without deleting any code.
 *
 * AD UNIT IDS come from EAS environment variables (`EXPO_PUBLIC_ADMOB_*`), never from source. When a
 * variable is missing the app falls back to Google's published TEST ad units, so a build made before
 * the AdMob account exists shows clearly-marked test ads and earns nothing. `usingTestAds()` says which
 * one is active. NEVER upload a build to Play that still uses test ads, and never tap a real ad on a
 * device you own — see docs/admob-setup.md for the full list of things to do before release.
 *
 * The AdMob *App ID* is not read here: it is a manifest value, set in app.json under the
 * `react-native-google-mobile-ads` plugin (`androidAppId`), and today holds Google's sample App ID.
 */
import { Platform } from 'react-native';

export const ADS_ENABLED = true;

/** Google's published test ad units (documented by Google as safe for development). */
const GOOGLE_TEST_UNITS = {
  banner: Platform.select({
    android: 'ca-app-pub-3940256099942544/9214589741', // adaptive banner
    default: 'ca-app-pub-3940256099942544/2435281174',
  }) as string,
  interstitial: Platform.select({
    android: 'ca-app-pub-3940256099942544/1033173712',
    default: 'ca-app-pub-3940256099942544/4411468910',
  }) as string,
};

export type AdPlacement = 'homeBanner' | 'matchBanner' | 'interstitial';

const FROM_ENV: Record<AdPlacement, string | undefined> = {
  homeBanner: process.env.EXPO_PUBLIC_ADMOB_BANNER_HOME,
  matchBanner: process.env.EXPO_PUBLIC_ADMOB_BANNER_MATCH,
  interstitial: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL,
};

const FALLBACK: Record<AdPlacement, string> = {
  homeBanner: GOOGLE_TEST_UNITS.banner,
  matchBanner: GOOGLE_TEST_UNITS.banner,
  interstitial: GOOGLE_TEST_UNITS.interstitial,
};

/** A real unit id looks like `ca-app-pub-1234567890123456/1234567890`. */
function isRealUnitId(value: string | undefined): value is string {
  return !!value && /^ca-app-pub-\d{16}\/\d{10}$/.test(value.trim());
}

export function adUnitId(placement: AdPlacement): string {
  const fromEnv = FROM_ENV[placement];
  return isRealUnitId(fromEnv) ? fromEnv.trim() : FALLBACK[placement];
}

/** True while any placement still resolves to a Google test ad unit. */
export function usingTestAds(): boolean {
  return (Object.keys(FROM_ENV) as AdPlacement[]).some((p) => !isRealUnitId(FROM_ENV[p]));
}

/**
 * How often a full-screen ad may appear. Deliberately conservative: it only ever shows when the
 * person leaves a Match Analysis screen (a natural pause), never at launch, never while reading.
 */
export const INTERSTITIAL_POLICY = {
  /** Match Analysis screens that must be closed since the last interstitial before another may show. */
  minMatchClosesBetween: 3,
  /** Minimum time between two interstitials. */
  minIntervalMs: 3 * 60 * 1000,
  /** No interstitial in the first minute after the app starts. */
  graceAfterStartMs: 60 * 1000,
  /** Hard cap per app session. */
  maxPerSession: 4,
} as const;
