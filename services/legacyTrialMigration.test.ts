import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LEGACY_DEVICE_ID_KEY,
  LEGACY_TRIAL_STARTED_AT_KEY,
  __resetInMemoryCacheForTests,
  legacyTrialAlreadyExpired,
  legacyTrialWasAlreadyUsedUp,
} from './legacyTrialMigration';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const DAY_MS = 24 * 60 * 60 * 1000;

describe('legacyTrialAlreadyExpired (pure boundary)', () => {
  it('a legacy trial started 13 days ago is not yet expired', () => {
    const now = Date.UTC(2026, 0, 15);
    expect(legacyTrialAlreadyExpired(now - 13 * DAY_MS, now)).toBe(false);
  });

  it('a legacy trial started exactly 14 days ago is expired', () => {
    const now = Date.UTC(2026, 0, 15);
    expect(legacyTrialAlreadyExpired(now - 14 * DAY_MS, now)).toBe(true);
  });

  it('a legacy trial started 20 days ago is expired', () => {
    const now = Date.UTC(2026, 0, 15);
    expect(legacyTrialAlreadyExpired(now - 20 * DAY_MS, now)).toBe(true);
  });
});

describe('legacyTrialWasAlreadyUsedUp (module-cached, storage-backed)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetInMemoryCacheForTests();
  });

  it('a brand-new install with no legacy key is not capped', async () => {
    await expect(legacyTrialWasAlreadyUsedUp()).resolves.toBe(false);
  });

  it('a device whose old local trial had already run out is capped', async () => {
    await AsyncStorage.setItem(LEGACY_TRIAL_STARTED_AT_KEY, String(Date.now() - 30 * DAY_MS));
    await expect(legacyTrialWasAlreadyUsedUp()).resolves.toBe(true);
  });

  it('a device whose old local trial was still within its 14 days is not capped', async () => {
    await AsyncStorage.setItem(LEGACY_TRIAL_STARTED_AT_KEY, String(Date.now() - 2 * DAY_MS));
    await expect(legacyTrialWasAlreadyUsedUp()).resolves.toBe(false);
  });

  it('clears the legacy keys after the one-time check, and never needs them again', async () => {
    await AsyncStorage.setItem(LEGACY_TRIAL_STARTED_AT_KEY, String(Date.now() - 30 * DAY_MS));
    await AsyncStorage.setItem(LEGACY_DEVICE_ID_KEY, 'dev_old_random_id');

    await legacyTrialWasAlreadyUsedUp();

    expect(await AsyncStorage.getItem(LEGACY_TRIAL_STARTED_AT_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(LEGACY_DEVICE_ID_KEY)).toBeNull();
  });

  it('is idempotent across a simulated restart: the verdict survives even after the legacy key itself is gone', async () => {
    await AsyncStorage.setItem(LEGACY_TRIAL_STARTED_AT_KEY, String(Date.now() - 30 * DAY_MS));
    await legacyTrialWasAlreadyUsedUp();
    expect(await AsyncStorage.getItem(LEGACY_TRIAL_STARTED_AT_KEY)).toBeNull();

    // Simulated app restart: in-memory cache gone, AsyncStorage (the marker
    // this wrote) survives — the real property a process restart has.
    __resetInMemoryCacheForTests();

    await expect(legacyTrialWasAlreadyUsedUp()).resolves.toBe(true);
  });

  it('can only ever narrow access: a device with no legacy state at all is always false, never true', async () => {
    await expect(legacyTrialWasAlreadyUsedUp()).resolves.toBe(false);
  });
});
