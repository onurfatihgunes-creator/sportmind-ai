import Purchases from 'react-native-purchases';
import { completePurchase, isPurchaseConfigured, restorePurchases, startPurchase } from './purchase';
import { readEntitlement } from './entitlement';
import { getMonthlyPackage, isRevenueCatConfigured } from './revenueCat';

jest.mock('./revenueCat', () => ({
  isRevenueCatConfigured: jest.fn(),
  getMonthlyPackage: jest.fn(),
}));

jest.mock('./entitlement', () => ({
  readEntitlement: jest.fn(),
}));

const mockIsConfigured = isRevenueCatConfigured as jest.Mock;
const mockGetMonthlyPackage = getMonthlyPackage as jest.Mock;
const mockReadEntitlement = readEntitlement as jest.Mock;
const monthlyPackage = { identifier: '$rc_monthly' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isPurchaseConfigured', () => {
  it('follows RevenueCat readiness directly — no separate flag of its own', () => {
    mockIsConfigured.mockReturnValue(false);
    expect(isPurchaseConfigured()).toBe(false);
    mockIsConfigured.mockReturnValue(true);
    expect(isPurchaseConfigured()).toBe(true);
  });
});

describe('startPurchase', () => {
  it('is unavailable when RevenueCat is not configured, and never resolves a package', async () => {
    mockIsConfigured.mockReturnValue(false);
    await expect(startPurchase()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(mockGetMonthlyPackage).not.toHaveBeenCalled();
  });

  it('is unavailable when there is no monthly package to buy', async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetMonthlyPackage.mockResolvedValue(null);
    await expect(startPurchase()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  });

  it("reports cancelled, and never touches the entitlement source, when the person backs out", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetMonthlyPackage.mockResolvedValue(monthlyPackage);
    (Purchases.purchasePackage as jest.Mock).mockRejectedValue({ userCancelled: true });
    await expect(startPurchase()).resolves.toEqual({ ok: false, reason: 'cancelled' });
    expect(mockReadEntitlement).not.toHaveBeenCalled();
  });

  it('reports failed on any other purchase error', async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetMonthlyPackage.mockResolvedValue(monthlyPackage);
    (Purchases.purchasePackage as jest.Mock).mockRejectedValue(new Error('store unreachable'));
    await expect(startPurchase()).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it("is pending, never failed, when the store purchase succeeds but RevenueCat's own record does not yet show it active", async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetMonthlyPackage.mockResolvedValue(monthlyPackage);
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });
    await expect(startPurchase()).resolves.toEqual({ ok: false, reason: 'pending' });
    expect(mockReadEntitlement).not.toHaveBeenCalled();
  });

  it('unlocks only once RevenueCat confirms "sportmind_pro" active AND the entitlement source itself says pro', async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetMonthlyPackage.mockResolvedValue(monthlyPackage);
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: { entitlements: { active: { sportmind_pro: {} } } },
    });
    const proState = { entitlement: 'pro', plan: 'sportmind-pro', trialEndsAt: null };
    mockReadEntitlement.mockResolvedValue(proState);
    await expect(startPurchase()).resolves.toEqual({ ok: true, entitlement: proState });
  });

  it('is pending (never failed) when RevenueCat confirms the entitlement but Vera has not synced yet — no webhook exists', async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetMonthlyPackage.mockResolvedValue(monthlyPackage);
    (Purchases.purchasePackage as jest.Mock).mockResolvedValue({
      customerInfo: { entitlements: { active: { sportmind_pro: {} } } },
    });
    mockReadEntitlement.mockResolvedValue({ entitlement: 'expired', plan: 'free', trialEndsAt: null });
    await expect(startPurchase()).resolves.toEqual({ ok: false, reason: 'pending' });
  });
});

describe('restorePurchases', () => {
  it('is unavailable when RevenueCat is not configured', async () => {
    mockIsConfigured.mockReturnValue(false);
    await expect(restorePurchases()).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(Purchases.restorePurchases).not.toHaveBeenCalled();
  });

  it('reports failed when the restore call itself throws', async () => {
    mockIsConfigured.mockReturnValue(true);
    (Purchases.restorePurchases as jest.Mock).mockRejectedValue(new Error('network'));
    await expect(restorePurchases()).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('re-reads the entitlement source after a successful restore call', async () => {
    mockIsConfigured.mockReturnValue(true);
    (Purchases.restorePurchases as jest.Mock).mockResolvedValue({ entitlements: { active: { sportmind_pro: {} } } });
    const proState = { entitlement: 'pro', plan: 'sportmind-pro', trialEndsAt: null };
    mockReadEntitlement.mockResolvedValue(proState);
    await expect(restorePurchases()).resolves.toEqual({ ok: true, entitlement: proState });
  });
});

describe('completePurchase', () => {
  it('unlocks only when the entitlement source itself says pro', async () => {
    mockReadEntitlement.mockResolvedValue({ entitlement: 'trial', plan: 'free', trialEndsAt: 123 });
    await expect(completePurchase()).resolves.toEqual({ ok: false, reason: 'pending' });
  });

  it('is pending, never failed, when the entitlement source itself is unreadable', async () => {
    mockReadEntitlement.mockRejectedValue(new Error('network'));
    await expect(completePurchase()).resolves.toEqual({ ok: false, reason: 'pending' });
  });
});
