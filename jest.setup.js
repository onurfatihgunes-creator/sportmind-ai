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
