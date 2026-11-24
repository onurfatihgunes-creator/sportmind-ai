import { INTERSTITIAL_POLICY } from '@/constants/ads';

/** What the policy needs to know. All timestamps are `Date.now()` milliseconds. */
export interface InterstitialState {
  /** When this app session started. */
  sessionStartedAt: number;
  /** Match Analysis screens closed since the last interstitial (or since launch). */
  closesSinceLastAd: number;
  /** When the last interstitial was shown, if any. */
  lastShownAt: number | null;
  /** How many interstitials this session has shown. */
  shownThisSession: number;
}

export function initialInterstitialState(now: number): InterstitialState {
  return { sessionStartedAt: now, closesSinceLastAd: 0, lastShownAt: null, shownThisSession: 0 };
}

/** A Match Analysis screen was closed. */
export function recordMatchClosed(state: InterstitialState): InterstitialState {
  return { ...state, closesSinceLastAd: state.closesSinceLastAd + 1 };
}

/** An interstitial was shown. */
export function recordInterstitialShown(state: InterstitialState, now: number): InterstitialState {
  return { ...state, closesSinceLastAd: 0, lastShownAt: now, shownThisSession: state.shownThisSession + 1 };
}

/**
 * Whether a full-screen ad may be shown now. Every condition must hold; any one of them stops it.
 * Pure on purpose: the screen that calls it decides *when to ask*, this decides *whether to allow*.
 */
export function mayShowInterstitial(state: InterstitialState, now: number): boolean {
  const p = INTERSTITIAL_POLICY;
  if (state.shownThisSession >= p.maxPerSession) return false;
  if (now - state.sessionStartedAt < p.graceAfterStartMs) return false;
  if (state.closesSinceLastAd < p.minMatchClosesBetween) return false;
  if (state.lastShownAt !== null && now - state.lastShownAt < p.minIntervalMs) return false;
  return true;
}
