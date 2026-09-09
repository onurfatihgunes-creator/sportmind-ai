/**
 * SportMind's one, minimal connection to the shared OnurAI/Vera platform —
 * used for exactly one thing: entitlement.
 *
 * WHY THIS EXISTS AND WHY IT IS SMALL. Unlike Stylist and Mutfak, SportMind
 * has never made an authenticated request to that platform before (its own
 * data — teams, fixtures, predictions — comes straight from its own
 * separate Supabase project, read-only, with no per-user identity at all;
 * see `lib/supabase.ts`). This file does not change that: SportMind's own
 * data access is completely untouched. It adds the smallest possible
 * integration needed to reuse the platform's ALREADY-EXISTING generic
 * mechanisms for the one new thing SportMind needs — an owner identity to
 * key a trial on, and a read of the shared, account-wide Pro entitlement —
 * rather than inventing a second one.
 *
 * NO SIGN-IN IS ADDED. SportMind has no accounts and this does not give it
 * any; the identity here is the exact same anonymous, no-login mechanism
 * Mutfak already uses (`POST /v1/mutfak/anonymous-session`,
 * `POST /v1/sportmind/anonymous-session` — same shared issuer, same shape),
 * scaled down to just what SportMind needs: no real-session layer, no
 * Logto, because there is nothing here for either of those to sign into.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

function read(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export const ONURAI_API_BASE_URL = read(
  process.env.EXPO_PUBLIC_ONURAI_API_URL,
  'http://127.0.0.1:8000',
);

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `answered ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface AnonymousSession {
  ownerToken: string;
  /** Epoch seconds, as the backend reports it. */
  expiresAt: number;
}

const ANON_KEY = 'sportmind.onurai.anonymous_session';

let cached: AnonymousSession | null = null;

/** Test-only: clears the in-memory cache without touching AsyncStorage, so
 * a test can simulate "the process restarted, the stored session did not
 * disappear" without `jest.resetModules()` — which would also reset the
 * AsyncStorage mock's own internal store, silently defeating the test it
 * was meant to support. Never called from production code. */
export function __resetInMemoryCacheForTests(): void {
  cached = null;
}

function expired(session: AnonymousSession): boolean {
  return session.expiresAt * 1000 <= Date.now();
}

async function restore(): Promise<AnonymousSession | null> {
  if (cached && !expired(cached)) return cached;
  try {
    const stored = await AsyncStorage.getItem(ANON_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as AnonymousSession;
    if (typeof parsed?.ownerToken !== 'string' || !parsed.ownerToken || expired(parsed)) {
      return null;
    }
    cached = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function mint(): Promise<AnonymousSession | null> {
  try {
    const response = await fetch(`${ONURAI_API_BASE_URL}/v1/sportmind/anonymous-session`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { owner_token?: unknown; expires_at?: unknown };
    if (typeof body.owner_token !== 'string' || typeof body.expires_at !== 'number') return null;
    const session: AnonymousSession = { ownerToken: body.owner_token, expiresAt: body.expires_at };
    cached = session;
    try {
      await AsyncStorage.setItem(ANON_KEY, JSON.stringify(session));
    } catch {
      // The in-memory copy still stands for this process; the next one
      // mints a fresh identity instead of finding none — the safe
      // direction to be wrong in, same as Mutfak's own session.ts.
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * The bearer token for this device's one identity, minting it on first use
 * and reusing the stored one after that. Returns `null` only when neither a
 * stored nor a freshly-minted session is available (offline, or anonymous
 * sessions unconfigured on this deployment) — callers treat that the same
 * way Mutfak's own `ensureAnonymousSession` does: every call below simply
 * 401s honestly rather than inventing a client-side identity.
 */
async function ownerToken(): Promise<string | null> {
  const existing = await restore();
  if (existing) return existing.ownerToken;
  const minted = await mint();
  return minted?.ownerToken ?? null;
}

/**
 * One request to the platform, authenticated with this device's anonymous
 * identity. Transport only, the same split every other client in this
 * workspace already draws between `http.ts` and its own domain services.
 */
export async function onuraiApi<T>(path: string): Promise<T> {
  const token = await ownerToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${ONURAI_API_BASE_URL}${path}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      throw new ApiError(response.status, `${path} answered ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'network');
  } finally {
    clearTimeout(timer);
  }
}
