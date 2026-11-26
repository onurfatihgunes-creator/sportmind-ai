import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
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
 * is called only after the person taps Start on the splash (see app/_layout.tsx), so the consent
 * form never appears on top of the splash.
 *
 * Order follows Google's UMP guidance: gather consent first, and only when the SDK says
 * `canRequestAds` initialise it. Where consent is required and refused, no ad request is ever made.
 *
 * Consent is re-checked (Nov 2026):
 *   - every time the app comes back to the foreground from the background (Google asks for a
 *     consent-info update at every app launch, and a resume is a launch from the user's view);
 *   - right after the privacy-options form closes, so a withdrawn choice stops ads in the SAME
 *     session (banners unmount, the preloaded interstitial is dropped) instead of next launch.
 * Overlapping checks are collapsed into one.
 */

let started = false;
let ready = false;
let sdkInitialized = false;
let privacyOptionsRequired = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function setReady(value: boolean) {
  if (ready === value) return;
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

/** Stops all ad activity for this session: banners unmount (ready=false), no interstitial is kept. */
function stopAds() {
  setReady(false);
  interstitial = null;
  interstitialLoaded = false;
}

/**
 * One consent pass. `gather` = ask UMP for fresh consent info and show the form if it is required
 * (app start / resume); without it only the stored result is re-read (after the privacy form).
 * Never throws: the app works the same without ads.
 */
async function syncConsent(gather: boolean): Promise<void> {
  if (gather) {
    try {
      // Shows the consent form when one is required (EEA/UK); resolves at once elsewhere. On
      // failure (offline, form unavailable) the SDK keeps the previous result, read below.
      await AdsConsent.gatherConsent();
    } catch {
      // fall through: canRequestAds still reflects the last known consent
    }
  }
  try {
    const info = await AdsConsent.getConsentInfo();
    setPrivacyOptionsRequired(info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED);
    if (!info.canRequestAds) {
      stopAds();
      return;
    }
    if (!sdkInitialized) {
      // PG: nothing stronger than "general audiences, parental guidance" content. Betting and
      // gambling ads are a separate category and are ALSO blocked in the AdMob console.
      await mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.PG });
      await mobileAds().initialize();
      sdkInitialized = true;
    }
    if (!ready) {
      setReady(true);
      preloadInterstitial();
    }
  } catch {
    // leave the current state as it is
  }
}

/** Collapses overlapping passes (e.g. a resume while the start-up pass is still running). */
function runConsent(gather: boolean): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = syncConsent(gather).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

let lastAppState: AppStateStatus = AppState.currentState;

function onAppStateChange(next: AppStateStatus) {
  // Only a real return from the background counts; 'inactive' <-> 'active' flips (system dialogs,
  // the consent form itself on some devices) must not start another pass.
  if (lastAppState === 'background' && next === 'active') void runConsent(true);
  lastAppState = next;
}

export async function startAds(): Promise<void> {
  if (!ADS_ENABLED || started) return;
  started = true;
  AppState.addEventListener('change', onAppStateChange);
  await runConsent(true);
}

/** Opens Google's privacy options form, then applies the (possibly changed) choice at once. */
export async function showAdPrivacyOptions(): Promise<void> {
  try {
    await AdsConsent.showPrivacyOptionsForm();
  } catch {
    // ignore: nothing to show
  }
  await runConsent(false);
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
