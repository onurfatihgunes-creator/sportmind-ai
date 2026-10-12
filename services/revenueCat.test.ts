import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import {
  __resetConfigurationForTests,
  ensureRevenueCatConfigured,
  getMonthlyPackage,
  hasActiveRevenueCatEntitlement,
  isRevenueCatConfigured,
} from './revenueCat';

jest.mock('@/services/onuraiClient', () => ({
  ownerToken: jest.fn().mockResolvedValue('anon:test-owner'),
}));

const ORIGINAL_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
const ORIGINAL_OS = Platform.OS;

function setAndroid(key: string | undefined) {
  (Platform as { OS: string }).OS = 'android';
  // `process.env.X = undefined` stringifies to "undefined" instead of
  // deleting the key — an actually-missing env var needs a real delete.
  if (key === undefined) {
    delete process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
  } else {
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = key;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetConfigurationForTests();
});

afterEach(() => {
  setAndroid(ORIGINAL_ANDROID_KEY);
  (Platform as { OS: string }).OS = ORIGINAL_OS;
});

describe('isRevenueCatConfigured', () => {
  it('is false on Android with no key', () => {
    setAndroid(undefined);
    expect(isRevenueCatConfigured()).toBe(false);
  });

  it('is false on Android with a blank key', () => {
    setAndroid('   ');
    expect(isRevenueCatConfigured()).toBe(false);
  });

  it('is false on iOS even with a real key — this app has no iOS provider', () => {
    (Platform as { OS: string }).OS = 'ios';
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = 'goog_realkey123';
    expect(isRevenueCatConfigured()).toBe(false);
  });

  it('is true on Android with a real key', () => {
    setAndroid('goog_realkey123');
    expect(isRevenueCatConfigured()).toBe(true);
  });
});

describe('ensureRevenueCatConfigured', () => {
  it('never calls Purchases.configure when unconfigured (safe with no key)', async () => {
    setAndroid(undefined);
    await ensureRevenueCatConfigured();
    expect(Purchases.configure).not.toHaveBeenCalled();
  });

  it('never calls Purchases.configure on iOS, key or not', async () => {
    (Platform as { OS: string }).OS = 'ios';
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = 'goog_realkey123';
    await ensureRevenueCatConfigured();
    expect(Purchases.configure).not.toHaveBeenCalled();
  });

  it('configures with the Android key and this device\'s own Vera owner identity as appUserID', async () => {
    setAndroid('goog_realkey123');
    await ensureRevenueCatConfigured();
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'goog_realkey123', appUserID: 'anon:test-owner' });
  });

  it('configures only once across concurrent/repeated calls', async () => {
    setAndroid('goog_realkey123');
    await Promise.all([ensureRevenueCatConfigured(), ensureRevenueCatConfigured()]);
    await ensureRevenueCatConfigured();
    expect(Purchases.configure).toHaveBeenCalledTimes(1);
  });
});

describe('getMonthlyPackage', () => {
  const fakePackage = { identifier: '$rc_monthly' };

  it('is null when unconfigured, without calling getOfferings', async () => {
    setAndroid(undefined);
    expect(await getMonthlyPackage()).toBeNull();
    expect(Purchases.getOfferings).not.toHaveBeenCalled();
  });

  it('resolves the $rc_monthly package from the current offering', async () => {
    setAndroid('goog_realkey123');
    (Purchases.getOfferings as jest.Mock).mockResolvedValue({
      current: { identifier: 'default', monthly: fakePackage },
      all: {},
    });
    expect(await getMonthlyPackage()).toBe(fakePackage);
  });

  it('falls back to the "default" offering by name when there is no current offering', async () => {
    setAndroid('goog_realkey123');
    (Purchases.getOfferings as jest.Mock).mockResolvedValue({
      current: null,
      all: { default: { identifier: 'default', monthly: fakePackage } },
    });
    expect(await getMonthlyPackage()).toBe(fakePackage);
  });

  it('is null when the resolved offering has no monthly package', async () => {
    setAndroid('goog_realkey123');
    (Purchases.getOfferings as jest.Mock).mockResolvedValue({
      current: { identifier: 'default', monthly: null },
      all: {},
    });
    expect(await getMonthlyPackage()).toBeNull();
  });
});

describe('hasActiveRevenueCatEntitlement', () => {
  it('is false when unconfigured, without calling getCustomerInfo', async () => {
    setAndroid(undefined);
    expect(await hasActiveRevenueCatEntitlement()).toBe(false);
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
  });

  it('is true when RevenueCat reports "sportmind_pro" active', async () => {
    setAndroid('goog_realkey123');
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
      entitlements: { active: { sportmind_pro: { identifier: 'sportmind_pro' } } },
    });
    expect(await hasActiveRevenueCatEntitlement()).toBe(true);
  });

  it('is false when RevenueCat reports the stale account-wide "Vera Pro" identifier instead of "sportmind_pro"', async () => {
    // Regression guard: this app used to check the wrong, account-wide
    // entitlement name — a dashboard configured correctly per the canonical
    // per-application model (sportmind_pro) must not be silently unmatched.
    setAndroid('goog_realkey123');
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({
      entitlements: { active: { 'Vera Pro': { identifier: 'Vera Pro' } } },
    });
    expect(await hasActiveRevenueCatEntitlement()).toBe(false);
  });

  it('is false when "sportmind_pro" is not in the active map', async () => {
    setAndroid('goog_realkey123');
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({ entitlements: { active: {} } });
    expect(await hasActiveRevenueCatEntitlement()).toBe(false);
  });

  it('fails closed (false), never throwing, when RevenueCat errors', async () => {
    setAndroid('goog_realkey123');
    (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('network'));
    await expect(hasActiveRevenueCatEntitlement()).resolves.toBe(false);
  });
});
