import { useSyncExternalStore } from 'react';
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  AdEventType,
  InterstitialAd,
  MaxAdContentRating,
} from 'react-native-google-mobile-ads';
import { ADS_ENABLED, adUnitId } from '@/constants/ads';
import {
  initialInterstitialState,
  mayShowInterstitial,
  recordInterstitialShown,
  recordMatchClosed,
  type InterstitialState,
} from './interstitialPolicy';

/**
 * Runtime for Google AdMob on the device. Nothing here runs until `startAds()` is called, and that
 * is called only after the first-launch welcome has been seen (see app/_layout.tsx), so the consent
 * form never appears on top of the welcome screen.
 *
 * Order matters and follows Google's UMP guidance: gather consent first, and only when the SDK says
 * `canRequestAds` initialise it. Where consent is required and refused, no ad request is ever made.
 */

let started = false;
let ready = false;
let privacyOptionsRequired = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function setReady(value: boolean) {
  ready = value;
  notify();
}

function setPrivacyOptionsRequired(value: boolean) {
  if (privacyOptionsRequired === value) return;
  privacyOptionsRequired = value;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True once consent allows ad requests and the SDK is initialised. Ad components render nothing before. */
export function useAdsReady(): boolean {
  return useSyncExternalStore(subscribe, () => ready, () => false);
}

/** True where the law requires a way to revisit the ad consent choice (e.g. EEA/UK). */
export function usePrivacyOptionsRequired(): boolean {
  return useSyncExternalStore(subscribe, () => privacyOptionsRequired, () => false);
}

/** Opens Google's privacy options form. Safe to call anywhere; never throws. */
export async function showAdPrivacyOptions(): Promise<void> {
  try {
    await AdsConsent.showPrivacyOptionsForm();
    // The choice may have changed whether ads can be requested; startAds() runs again next launch.
  } catch {
    // ignore: nothing to show
  }
}

export async function startAds(): Promise<void> {
  if (!ADS_ENABLED || started) return;
  started = true;
  try {
    // Shows the consent form when one is required (EEA/UK); resolves at once elsewhere. On failure
    // (offline, form unavailable) the SDK keeps the previous session's status, which we read below.
    await AdsConsent.gatherConsent();
  } catch {
    // fall through: canRequestAds still reflects the last known consent
  }
  try {
    const info = await AdsConsent.getConsentInfo();
    setPrivacyOptionsRequired(
      info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
    );
    if (!info.canRequestAds) return;
    // PG: nothing stronger than "general audiences, parental guidance" content. Betting and gambling
    // ads are a separate category and must ALSO be blocked in the AdMob console (docs/admob-setup.md).
    await mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.PG });
    await mobileAds().initialize();
    setReady(true);
    preloadInterstitial();
  } catch {
    // The app works the same without ads: leave `ready` false.
  }
}

// ---- Interstitial -----------------------------------------------------------------------------

let interstitial: ReturnType<typeof InterstitialAd.createForAdRequest> | null = null;
let interstitialLoaded = false;
let policyState: InterstitialState = initialInterstitialState(Date.now());

function preloadInterstitial() {
  if (!ready) return;
  const ad = InterstitialAd.createForAdRequest(adUnitId('interstitial'));
  interstitial = ad;
  interstitialLoaded = false;
  ad.addAdEventListener(AdEventType.LOADED, () => {
    if (interstitial === ad) interstitialLoaded = true;
  });
  ad.addAdEventListener(AdEventType.CLOSED, () => {
    if (interstitial === ad) preloadInterstitial();
  });
  ad.addAdEventListener(AdEventType.ERROR, () => {
    if (interstitial === ad) {
      interstitial = null;
      interstitialLoaded = false;
    }
  });
  ad.load();
}

/**
 * Call when a Match Analysis screen is closed. Counts it and, if the policy allows and an ad is
 * already loaded, shows one. Never waits for a load: no ad ready means no ad.
 */
export function onMatchAnalysisClosed(): void {
  if (!ADS_ENABLED) return;
  policyState = recordMatchClosed(policyState);
  if (!ready || !interstitial || !interstitialLoaded) return;
  const now = Date.now();
  if (!mayShowInterstitial(policyState, now)) return;
  policyState = recordInterstitialShown(policyState, now);
  interstitialLoaded = false;
  try {
    void interstitial.show();
  } catch {
    // ignore: a failed show must never affect navigation
  }
}
