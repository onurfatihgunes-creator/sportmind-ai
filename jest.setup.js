jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// react-native-purchases is a native module (its real package also pulls in
// a Svelte-based paywall bundle Jest can't parse at all) — ships no jest
// mock of its own, so every test file that touches it (directly or via
// services/purchase.ts / services/revenueCat.ts) configures these same
// jest.fn()s with whatever behavior that test needs.
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

// react-native-google-mobile-ads is a native module with no jest mock of its own. Consent is
// reported as "cannot request ads", so no test ever initialises the SDK or renders a real banner.
jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  default: () => ({
    initialize: jest.fn(() => Promise.resolve([])),
    setRequestConfiguration: jest.fn(() => Promise.resolve()),
  }),
  AdsConsent: {
    gatherConsent: jest.fn(() => Promise.resolve()),
    getConsentInfo: jest.fn(() => Promise.resolve({ canRequestAds: false })),
  },
  BannerAd: () => null,
  BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' },
  InterstitialAd: { createForAdRequest: jest.fn() },
  AdsConsentPrivacyOptionsRequirementStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED', UNKNOWN: 'UNKNOWN' },
  AdEventType: { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error' },
  MaxAdContentRating: { PG: 'PG' },
  TestIds: {},
}));
