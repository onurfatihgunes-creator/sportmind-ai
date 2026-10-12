import { resolveDisplayedEntitlement } from './EntitlementContext';

// Covers the one decision this task adds to entitlement display: bridging the gap left
// by not wiring a RevenueCat → Vera webhook (see services/purchase.ts's own header).
// Vera's 14-day trial/Pro system itself (services/entitlement.ts) is untouched — these
// cases only cover the one place its `expired` answer can be overridden, and only ever
// upward to `pro`, never the reverse.
describe('resolveDisplayedEntitlement', () => {
  it("during the trial, Vera's own answer stands untouched regardless of RevenueCat", () => {
    expect(resolveDisplayedEntitlement('trial', false)).toBe('trial');
    expect(resolveDisplayedEntitlement('trial', true)).toBe('trial');
  });

  it('an active Pro answer from Vera stands untouched', () => {
    expect(resolveDisplayedEntitlement('pro', false)).toBe('pro');
  });

  it('after the trial ends, no active RevenueCat entitlement leaves the paywall showing', () => {
    expect(resolveDisplayedEntitlement('expired', false)).toBe('expired');
  });

  it('after the trial ends, an active RevenueCat "sportmind_pro" entitlement unlocks Pro immediately — no webhook needed', () => {
    expect(resolveDisplayedEntitlement('expired', true)).toBe('pro');
  });
});
