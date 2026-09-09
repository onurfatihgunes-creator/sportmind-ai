import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A one-time, client-side-only safety net for a device that ran SportMind's
 * OLD, pre-Vera-identity trial — commit "feat: add SportMind Pro
 * monetization": a locally-tracked `sportmind_local_trial_started_at`
 * timestamp, computed on-device with no server involved at all — before
 * this device ever had a Vera anonymous identity.
 *
 * WHY THIS EXISTS. The new architecture's trial is entirely server-side
 * (see entitlement.ts), keyed to a freshly-minted anonymous Vera identity
 * that has never touched `GET /v1/entitlement?application=sportmind`
 * before. Left alone, a device that had already used up some or all of its
 * OLD local trial would get a second, full fourteen days for free the
 * moment this code ships — exactly the "identity storage changed, so the
 * trial silently restarted" bug this migration exists to prevent.
 *
 * WHY THIS IS SAFE TO DECIDE CLIENT-SIDE, WHEN "THE CLIENT DECIDES NOTHING"
 * IS THE WHOLE POINT OF THE REST OF THIS SYSTEM. This can only ever make
 * this device's own effective entitlement MORE restrictive than what the
 * server alone reports — never less. It cannot be used to claim Pro, extend
 * a trial, or affect any other device's entitlement; the worst a dishonest
 * client could do by lying to itself here is see a paywall it did not have
 * to. There is no version of this check that grants extra access, which is
 * the only direction that would matter.
 *
 * A ONE-TIME MIGRATION, NOT AN ONGOING FEATURE. `alreadyMigrated` records
 * the verdict once so the (now-orphaned) legacy keys are read at most once
 * per install, ever — a brand-new install after this shipped never had them
 * and this resolves to `false` on its first, only check.
 */

export const LEGACY_TRIAL_STARTED_AT_KEY = 'sportmind_local_trial_started_at';
export const LEGACY_DEVICE_ID_KEY = 'sportmind_device_id';
const MIGRATION_MARKER_KEY = 'sportmind_legacy_trial_migration_v1';
const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Pure: given the OLD local trial's start, had it already run out by `now`?
 * Exported so the boundary is unit-testable without touching AsyncStorage.
 */
export function legacyTrialAlreadyExpired(legacyStartedAtMs: number, now: number = Date.now()): boolean {
  return now >= legacyStartedAtMs + TRIAL_MS;
}

let cached: Promise<boolean> | null = null;

/** Test-only: see onuraiClient.ts's identical helper for why this exists
 * instead of `jest.resetModules()`. Never called from production code. */
export function __resetInMemoryCacheForTests(): void {
  cached = null;
}

/**
 * Whether THIS device's old local trial had already run out before this
 * code ever ran. `true` is the only case that must override the server's
 * fresh `trial` answer down to `expired` — see entitlement.ts. Caches its
 * own result in memory for the life of the process; the AsyncStorage marker
 * makes the underlying check a no-op on every launch after the first.
 */
export async function legacyTrialWasAlreadyUsedUp(): Promise<boolean> {
  cached ??= resolve();
  return cached;
}

async function resolve(): Promise<boolean> {
  const marker = await AsyncStorage.getItem(MIGRATION_MARKER_KEY).catch(() => null);
  if (marker !== null) return marker === 'expired';

  let result = false;
  try {
    const raw = await AsyncStorage.getItem(LEGACY_TRIAL_STARTED_AT_KEY);
    if (raw !== null) {
      const startedAt = Number(raw);
      if (Number.isFinite(startedAt) && legacyTrialAlreadyExpired(startedAt)) {
        result = true;
      }
    }
  } catch {
    // Unreadable legacy state is not evidence of anything. The safe
    // direction here is the one the rest of this system already takes on
    // any unreadable state: never restrict access over a state that could
    // not be confirmed.
  }

  await AsyncStorage.setItem(MIGRATION_MARKER_KEY, result ? 'expired' : 'clean').catch(() => {});
  // The legacy keys have served their one purpose; nothing reads them again
  // after this — see the module header on why removing them is safe here
  // (compare: entitlement.ts's own "do not blindly delete storage keys"
  // discipline, which this satisfies by reading before ever clearing).
  await AsyncStorage.multiRemove([LEGACY_TRIAL_STARTED_AT_KEY, LEGACY_DEVICE_ID_KEY]).catch(() => {});
  return result;
}
