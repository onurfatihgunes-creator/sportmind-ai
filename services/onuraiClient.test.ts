import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, __resetInMemoryCacheForTests, onuraiApi } from './onuraiClient';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const ANON_STORAGE_KEY = 'sportmind.onurai.anonymous_session';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('onuraiApi identity: mint-once, reuse thereafter', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetInMemoryCacheForTests();
    (global as any).fetch = jest.fn();
  });

  it('a fresh device mints exactly one anonymous session for its first authenticated call', async () => {
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ owner_token: 'anon:aaa', expires_at: 9_999_999_999 }))
      .mockResolvedValueOnce(jsonResponse({ entitlement: 'trial', plan: 'free', trial_started_at: 1, trial_ends_at: 2 }));

    await onuraiApi('/v1/entitlement?application=sportmind');

    const mintCalls = fetchMock.mock.calls.filter(([url]: [string]) => url.includes('/anonymous-session'));
    expect(mintCalls).toHaveLength(1);
    const entitlementCall = fetchMock.mock.calls.find(([url]: [string]) => url.includes('/entitlement'));
    expect(entitlementCall![1].headers.Authorization).toBe('Bearer anon:aaa');
  });

  it('a second call in the same process reuses the identity — no second mint', async () => {
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/anonymous-session')) {
        return Promise.resolve(jsonResponse({ owner_token: 'anon:bbb', expires_at: 9_999_999_999 }));
      }
      return Promise.resolve(jsonResponse({ entitlement: 'trial', plan: 'free' }));
    });

    await onuraiApi('/v1/entitlement?application=sportmind');
    await onuraiApi('/v1/entitlement?application=sportmind');

    const mintCalls = fetchMock.mock.calls.filter(([url]: [string]) => url.includes('/anonymous-session'));
    expect(mintCalls).toHaveLength(1);
  });

  it('app restart preserves identity: with the in-memory cache cleared but AsyncStorage intact, no second mint happens', async () => {
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ owner_token: 'anon:ccc', expires_at: 9_999_999_999 }))
      .mockResolvedValue(jsonResponse({ entitlement: 'trial', plan: 'free' }));

    await onuraiApi('/v1/entitlement?application=sportmind');
    expect(await AsyncStorage.getItem(ANON_STORAGE_KEY)).toContain('anon:ccc');

    // A genuine restart: the in-memory cache is gone, AsyncStorage is not —
    // the real distinction a process restart makes.
    __resetInMemoryCacheForTests();
    fetchMock.mockClear();
    await onuraiApi('/v1/entitlement?application=sportmind');

    const mintCalls = fetchMock.mock.calls.filter(([url]: [string]) => url.includes('/anonymous-session'));
    expect(mintCalls).toHaveLength(0);
    const entitlementCall = fetchMock.mock.calls.find(([url]: [string]) => url.includes('/entitlement'));
    expect(entitlementCall![1].headers.Authorization).toBe('Bearer anon:ccc');
  });

  it('an expired stored session is not reused — a fresh one is minted instead', async () => {
    await AsyncStorage.setItem(
      ANON_STORAGE_KEY,
      JSON.stringify({ ownerToken: 'anon:stale', expiresAt: 1 }), // epoch seconds, long past
    );
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ owner_token: 'anon:renewed', expires_at: 9_999_999_999 }))
      .mockResolvedValueOnce(jsonResponse({ entitlement: 'trial', plan: 'free' }));

    await onuraiApi('/v1/entitlement?application=sportmind');

    const entitlementCall = fetchMock.mock.calls.find(([url]: [string]) => url.includes('/entitlement'));
    expect(entitlementCall![1].headers.Authorization).toBe('Bearer anon:renewed');
  });

  it('every request carries the token the server itself issued over POST /v1/sportmind/anonymous-session, never a client-invented one', async () => {
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ owner_token: 'anon:server-issued', expires_at: 9_999_999_999 }))
      .mockResolvedValueOnce(jsonResponse({ entitlement: 'trial', plan: 'free' }));

    await onuraiApi('/v1/entitlement?application=sportmind');

    const [mintUrl, mintInit] = fetchMock.mock.calls[0];
    expect(mintUrl).toContain('/v1/sportmind/anonymous-session');
    expect(mintInit.method).toBe('POST');
  });
});

describe('onuraiApi failure behavior', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetInMemoryCacheForTests();
    (global as any).fetch = jest.fn();
  });

  it('a network failure while minting leaves the request unauthenticated (no Authorization header), never a fabricated identity', async () => {
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse({ entitlement: 'trial', plan: 'free' }));

    await onuraiApi('/v1/entitlement?application=sportmind');

    const entitlementCall = fetchMock.mock.calls.find(([url]: [string]) => url.includes('/entitlement'));
    expect(entitlementCall![1].headers.Authorization).toBeUndefined();
  });

  it('an unreachable server surfaces as ApiError with status 0, distinguishable from a real HTTP error', async () => {
    const fetchMock = (global as any).fetch as jest.Mock;
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(onuraiApi('/v1/entitlement?application=sportmind')).rejects.toMatchObject({
      status: 0,
    } satisfies Partial<InstanceType<typeof ApiError>>);
  });
});
