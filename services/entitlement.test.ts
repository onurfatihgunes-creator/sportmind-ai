import AsyncStorage from '@react-native-async-storage/async-storage';
import { __resetInMemoryCacheForTests as resetClientCache } from './onuraiClient';
import { LEGACY_TRIAL_STARTED_AT_KEY, __resetInMemoryCacheForTests as resetMigrationCache } from './legacyTrialMigration';
import { readEntitlement } from './entitlement';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const DAY_MS = 24 * 60 * 60 * 1000;

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetClientCache();
  resetMigrationCache();
  (global as any).fetch = jest.fn();
});

describe('readEntitlement: server is authoritative, client only reads', () => {
  it('reports the server-computed trial state and end date verbatim', async () => {
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ owner_token: 'anon:x', expires_at: 9_999_999_999 }))
      .mockResolvedValueOnce(
        jsonResponse({ entitlement: 'trial', plan: 'free', trial_started_at: 1000, trial_ends_at: 2000 }),
      );

    const state = await readEntitlement();

    expect(state.entitlement).toBe('trial');
    expect(state.trialEndsAt).toBe(2000 * 1000); // seconds -> ms
  });

  it('a genuine "pro" answer is never second-guessed by the legacy migration cap', async () => {
    await AsyncStorage.setItem(LEGACY_TRIAL_STARTED_AT_KEY, String(Date.now() - 30 * DAY_MS));
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ owner_token: 'anon:x', expires_at: 9_999_999_999 }))
      .mockResolvedValueOnce(jsonResponse({ entitlement: 'pro', plan: 'premium' }));

    const state = await readEntitlement();

    expect(state.entitlement).toBe('pro');
  });

  it('an already-expired server answer stays expired regardless of the legacy migration cap', async () => {
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ owner_token: 'anon:x', expires_at: 9_999_999_999 }))
      .mockResolvedValueOnce(jsonResponse({ entitlement: 'expired', plan: 'free' }));

    const state = await readEntitlement();

    expect(state.entitlement).toBe('expired');
  });

  it('a device whose OLD local trial had already run out is capped down from a fresh server trial', async () => {
    await AsyncStorage.setItem(LEGACY_TRIAL_STARTED_AT_KEY, String(Date.now() - 30 * DAY_MS));
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ owner_token: 'anon:x', expires_at: 9_999_999_999 }))
      .mockResolvedValueOnce(jsonResponse({ entitlement: 'trial', plan: 'free' }));

    const state = await readEntitlement();

    expect(state.entitlement).toBe('expired');
  });

  it('a brand-new device with no legacy state gets the fresh server trial untouched', async () => {
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ owner_token: 'anon:x', expires_at: 9_999_999_999 }))
      .mockResolvedValueOnce(jsonResponse({ entitlement: 'trial', plan: 'free' }));

    const state = await readEntitlement();

    expect(state.entitlement).toBe('trial');
  });

  it('a network failure answers trial, never expired — an unreadable answer must not lock anyone out', async () => {
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock.mockRejectedValue(new Error('offline'));

    const state = await readEntitlement();

    expect(state.entitlement).toBe('trial');
  });

  it('a network failure answers trial even for a device whose legacy trial had already run out — the cap only ever narrows a real server answer, it does not run on failure', async () => {
    await AsyncStorage.setItem(LEGACY_TRIAL_STARTED_AT_KEY, String(Date.now() - 30 * DAY_MS));
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock.mockRejectedValue(new Error('offline'));

    const state = await readEntitlement();

    expect(state.entitlement).toBe('trial');
  });
});
