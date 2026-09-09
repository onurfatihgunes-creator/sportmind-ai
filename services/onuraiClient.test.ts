import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ApiError, __resetInMemoryCacheForTests, apiBaseUrlProblem, onuraiApi } from './onuraiClient';

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

// --- What makes a base URL fit to ship — ported from the Stylist client's own
// productionConfig.test.ts, same reasoning: EXPO_PUBLIC_* is inlined at BUILD
// time, so a production build that never received a real URL is
// indistinguishable from a working one until it is on a phone, asking the
// phone itself for an entitlement. See onuraiClient.ts's own header on why
// this is a test rather than a runtime throw.

describe('apiBaseUrlProblem: what a release build may not be configured to do', () => {
  const WHY: Record<string, string> = {
    not_a_url: 'is not a URL at all',
    not_https: 'is not https, and a release build puts a bearer token on every request',
    unreachable_host: 'points at a development host a release build cannot reach',
  };

  it('a loopback or private host is refused', () => {
    for (const url of [
      'http://127.0.0.1:8000',
      'https://127.0.0.1:8000',
      'https://localhost:8000',
      'https://10.0.0.5:8000',
      'https://192.168.1.24:8000',
      'https://172.20.0.9:8000',
      'https://onur-mac.local:8000',
    ]) {
      expect(apiBaseUrlProblem(url)).toBeTruthy();
    }
  });

  it('plaintext http is refused even on a public host', () => {
    expect(apiBaseUrlProblem('http://api.example.com')).toBe('not_https');
  });

  it('the two faults are told apart, because they are fixed differently', () => {
    expect(apiBaseUrlProblem('https://127.0.0.1:8000')).toBe('unreachable_host');
    expect(apiBaseUrlProblem('http://api.example.com')).toBe('not_https');
    expect(apiBaseUrlProblem('nonsense')).toBe('not_a_url');
  });

  it('a public https host is accepted', () => {
    expect(apiBaseUrlProblem('https://api.example.com')).toBeNull();
    expect(apiBaseUrlProblem('https://api.example.com:8443')).toBeNull();
  });

  it('something that is not a URL is refused rather than passed through', () => {
    expect(apiBaseUrlProblem('api.example.com')).toBeTruthy();
    expect(apiBaseUrlProblem('')).toBeTruthy();
  });

  // --- The committed build configuration -------------------------------------

  const eas = JSON.parse(readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8'));

  it('the production profile names no unshippable API url — or defers to EAS env vars, which this repo does not know', () => {
    // SportMind's eas.json ties the "production" build to an EAS Environment
    // by NAME ("environment": "production") rather than an inline `env`
    // object, so the real URL lives on the EAS dashboard, not in this file —
    // exactly the case Stylist's own equivalent test already treats as
    // unverifiable rather than absent. If that ever changes to an inline
    // value, this assertion starts checking it.
    const url = eas.build?.production?.env?.EXPO_PUBLIC_ONURAI_API_URL;
    if (url === undefined) return; // REMOTE EAS VALUE NOT VERIFIABLE FROM THIS ENVIRONMENT
    const problem = apiBaseUrlProblem(url);
    expect(problem).toBeNull();
    if (problem) throw new Error(`eas.json's production profile cannot ship: ${url} ${WHY[problem]}`);
  });

  it('no build profile commits a token or a secret', () => {
    for (const [name, profile] of Object.entries<any>(eas.build ?? {})) {
      for (const key of Object.keys(profile?.env ?? {})) {
        expect(/TOKEN|SECRET|KEY$/.test(key)).toBe(false);
      }
    }
  });

  it('EXPO_PUBLIC_ONURAI_API_URL is documented in .env.example', () => {
    const example = readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
    expect(example).toContain('EXPO_PUBLIC_ONURAI_API_URL');
  });
});
