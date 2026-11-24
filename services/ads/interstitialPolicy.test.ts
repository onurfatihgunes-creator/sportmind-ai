import { INTERSTITIAL_POLICY } from '@/constants/ads';
import {
  initialInterstitialState,
  mayShowInterstitial,
  recordInterstitialShown,
  recordMatchClosed,
  type InterstitialState,
} from './interstitialPolicy';

const T0 = 1_000_000;
const MIN = 60 * 1000;

function afterCloses(state: InterstitialState, n: number) {
  let s = state;
  for (let i = 0; i < n; i++) s = recordMatchClosed(s);
  return s;
}

describe('interstitial policy', () => {
  test('never in the first minute after launch', () => {
    const s = afterCloses(initialInterstitialState(T0), 5);
    expect(mayShowInterstitial(s, T0 + INTERSTITIAL_POLICY.graceAfterStartMs - 1)).toBe(false);
    expect(mayShowInterstitial(s, T0 + INTERSTITIAL_POLICY.graceAfterStartMs)).toBe(true);
  });

  test('needs enough Match Analysis screens closed since the last ad', () => {
    const base = initialInterstitialState(T0);
    const now = T0 + 10 * MIN;
    expect(mayShowInterstitial(afterCloses(base, INTERSTITIAL_POLICY.minMatchClosesBetween - 1), now)).toBe(false);
    expect(mayShowInterstitial(afterCloses(base, INTERSTITIAL_POLICY.minMatchClosesBetween), now)).toBe(true);
  });

  test('showing an ad resets the count and starts the minimum interval', () => {
    const shownAt = T0 + 10 * MIN;
    let s = recordInterstitialShown(afterCloses(initialInterstitialState(T0), 3), shownAt);
    expect(s.closesSinceLastAd).toBe(0);
    s = afterCloses(s, 5);
    // enough closes, but too soon after the last one
    expect(mayShowInterstitial(s, shownAt + INTERSTITIAL_POLICY.minIntervalMs - 1)).toBe(false);
    expect(mayShowInterstitial(s, shownAt + INTERSTITIAL_POLICY.minIntervalMs)).toBe(true);
  });

  test('stops at the per-session cap', () => {
    let s = initialInterstitialState(T0);
    let now = T0;
    for (let i = 0; i < INTERSTITIAL_POLICY.maxPerSession; i++) {
      now += 10 * MIN;
      s = afterCloses(s, INTERSTITIAL_POLICY.minMatchClosesBetween);
      expect(mayShowInterstitial(s, now)).toBe(true);
      s = recordInterstitialShown(s, now);
    }
    now += 60 * MIN;
    s = afterCloses(s, 10);
    expect(mayShowInterstitial(s, now)).toBe(false);
  });
});
