/**
 * The pure trial-clock arithmetic, deliberately split out from entitlement.ts.
 *
 * WHY A SEPARATE FILE. entitlement.ts imports AsyncStorage and the Supabase
 * client, both of which need a React Native runtime to even load (confirmed:
 * importing entitlement.ts from a plain Jest test throws "NativeModule:
 * AsyncStorage is null" before a single test runs). This function has no
 * such dependency and needs none — keeping it here lets entitlement.test.ts
 * exercise the real trial boundary logic without a native-module mock.
 */
export type Entitlement = 'pro' | 'trial' | 'expired';

const TRIAL_DAYS = 14;
export const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/**
 * The state-machine step. `now` is injectable so entitlement.test.ts can
 * verify the day-0/13/14/15 boundaries deterministically — production code
 * never passes it explicitly and gets Date.now().
 *
 * THIS IS ONLY EVER USED BY THE LOCAL FALLBACK in entitlement.ts's
 * readEntitlement. The real, server-backed path does not call this —
 * Postgres's own now() decides `entitlement` in the pro_entitlement_state
 * view (see backend/sql/pro_entitlement.sql), so that path is not exposed
 * to a client clock at all.
 */
export function computeLocalEntitlement(
  trialStartedAtMs: number,
  proActive: boolean,
  now: number = Date.now(),
): { entitlement: Entitlement; trialEndsAt: number } {
  const trialEndsAt = trialStartedAtMs + TRIAL_MS;
  if (proActive) return { entitlement: 'pro', trialEndsAt };
  return { entitlement: now < trialEndsAt ? 'trial' : 'expired', trialEndsAt };
}
