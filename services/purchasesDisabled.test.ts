/**
 * PURCHASES_ENABLED = false (the first release): nothing can start a purchase, nothing asks a
 * server who is a subscriber, and nobody is gated — including a device whose stored state says
 * the trial ended. Nothing is deleted; the enabled behaviour is covered by the other suites,
 * which switch the flag on.
 */
jest.mock('@/constants/featureFlags', () => ({ PURCHASES_ENABLED: false }));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    getCustomerInfo: jest.fn(),
  },
}));
jest.mock('@/services/onuraiClient', () => ({
  onuraiApi: jest.fn(),
  ownerToken: jest.fn(),
  ApiError: class ApiError extends Error {},
}));

import Purchases from 'react-native-purchases';
import { onuraiApi, ownerToken } from '@/services/onuraiClient';
import { resolveAccess } from '@/contexts/EntitlementContext';
import { readEntitlement } from '@/services/entitlement';
import { isPurchaseConfigured, restorePurchases, startPurchase } from '@/services/purchase';
import { ensureRevenueCatConfigured, getMonthlyPackage, hasActiveRevenueCatEntitlement, isRevenueCatConfigured } from '@/services/revenueCat';

describe('purchases switched off', () => {
  const OLD = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
  beforeAll(() => {
    // Even a build that carries a key must not configure or call RevenueCat.
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = 'goog_test_key_not_real';
  });
  afterAll(() => {
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = OLD;
  });

  it('never configures RevenueCat, opens an offering or reads customer info', async () => {
    expect(isRevenueCatConfigured()).toBe(false);
    await ensureRevenueCatConfigured();
    expect(await getMonthlyPackage()).toBeNull();
    expect(await hasActiveRevenueCatEntitlement()).toBe(false);
    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(Purchases.getOfferings).not.toHaveBeenCalled();
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
    expect(ownerToken).not.toHaveBeenCalled();
  });

  it('cannot start or restore a purchase', async () => {
    expect(isPurchaseConfigured()).toBe(false);
    expect(await startPurchase()).toEqual({ ok: false, reason: 'unavailable' });
    expect(await restorePurchases()).toEqual({ ok: false, reason: 'unavailable' });
    expect(Purchases.purchasePackage).not.toHaveBeenCalled();
    expect(Purchases.restorePurchases).not.toHaveBeenCalled();
  });

  it('makes no entitlement request (no anonymous session, no network)', async () => {
    await readEntitlement();
    expect(onuraiApi).not.toHaveBeenCalled();
  });

  it('gates nobody: new, existing, trial-expired and former-Pro devices all keep access', () => {
    for (const status of ['loading', 'trial', 'expired', 'pro'] as const) {
      expect(resolveAccess(status, false)).toBe(true);
    }
  });

  it('still gates a finished trial once purchases are switched back on', () => {
    expect(resolveAccess('expired', true)).toBe(false);
    expect(resolveAccess('trial', true)).toBe(true);
    expect(resolveAccess('pro', true)).toBe(true);
    expect(resolveAccess('loading', true)).toBe(true);
  });
});
