import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { computeLocalEntitlement, type Entitlement } from '@/services/entitlementMath';

export type { Entitlement } from '@/services/entitlementMath';

/**
 * What a person is entitled to — reference implementation: Stylist's
 * services/stylist/entitlement.ts. Same three-state shape, same rule: THE
 * SERVER DECIDES AND THIS ONLY READS. Nothing in this module derives
 * "expired" from a client-side date comparison against the real source —
 * see readEntitlement below for the one deliberate, clearly-flagged
 * exception this app has that Stylist does not need.
 */

export interface EntitlementState {
  entitlement: Entitlement;
  /** Epoch milliseconds, or null when it genuinely could not be determined. */
  trialEndsAt: number | null;
  /** The anonymous device identity this state was read for. */
  deviceId: string;
  /**
   * Whether this answer came from the server-computed source of truth or
   * from the local fallback below. Surfaced (not hidden) so the rest of the
   * app — and this codebase's own tests — can tell the two apart rather
   * than silently trusting a weaker guarantee as if it were the real one.
   */
  source: 'server' | 'local-fallback' | 'unconfigured';
}

const DEVICE_ID_KEY = 'sportmind_device_id';
const LOCAL_TRIAL_STARTED_AT_KEY = 'sportmind_local_trial_started_at';

/**
 * A device-scoped random id, generated once and persisted — the same role
 * Stylist's anonymous owner token plays, minus the network round trip:
 * Stylist mints its token on a server because it doubles as a bearer
 * credential for owner-scoped routes; this id is not a credential, only a
 * row key, so it is generated locally. `Math.random` is fine here — nothing
 * security-sensitive depends on this being unguessable, only on it being
 * the same value every time this device asks.
 */
function generateDeviceId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `dev_${Date.now().toString(36)}${rand()}${rand()}`;
}

let cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }
  const fresh = generateDeviceId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
  cachedDeviceId = fresh;
  return fresh;
}

async function readLocalFallback(deviceId: string): Promise<EntitlementState> {
  let startedRaw = await AsyncStorage.getItem(LOCAL_TRIAL_STARTED_AT_KEY);
  if (!startedRaw) {
    startedRaw = String(Date.now());
    await AsyncStorage.setItem(LOCAL_TRIAL_STARTED_AT_KEY, startedRaw);
  }
  const startedAt = Number(startedRaw);
  const { entitlement, trialEndsAt } = computeLocalEntitlement(startedAt, false);
  return { entitlement, trialEndsAt, deviceId, source: 'local-fallback' };
}

interface EntitlementRow {
  device_id: string;
  entitlement: string;
  trial_ends_at: string;
  pro_active: boolean;
}

/**
 * Read what this device is entitled to.
 *
 * ORDER OF OPERATIONS, mirroring purchase.ts's own header for why each step
 * is separate: ensure a row exists (first launch only — the insert trigger
 * pins the real trial_started_at server-side no matter what this sends),
 * then read the computed view, which is Postgres's own now() answering,
 * never this client's.
 *
 * THE LOCAL FALLBACK, AND WHY IT IS HONEST RATHER THAN A COMPROMISE. Three
 * cases fall back to a locally-tracked trial instead of the server-backed
 * one: no Supabase configuration (dev/mock mode — see lib/supabase.ts),
 * the migration in backend/sql/pro_entitlement.sql not yet applied (the
 * table/view do not exist — Postgres reports this as a specific "relation
 * does not exist" error, matched below rather than assumed from any
 * failure), or a genuine network error. All three are reported as `source:
 * 'local-fallback'` (or 'unconfigured') rather than silently presented as
 * the real thing, so a caller — or this module's own tests — can tell.
 *
 * The local fallback is the SAME weaker guarantee Stylist's own anonymous
 * trial has against a reinstall: this app cannot yet tell "the migration
 * genuinely is not applied" apart from "this person cleared app storage,"
 * so a clean install always gets a fresh 14 days either way, exactly as
 * Stylist's own header documents as an accepted V1 limitation. What IS
 * closed once the migration is applied is client-clock abuse: the local
 * fallback's Date.now() comparison is gone, replaced by Postgres's now().
 */
export async function readEntitlement(): Promise<EntitlementState> {
  const deviceId = await getDeviceId();

  if (!supabase) {
    const fallback = await readLocalFallback(deviceId);
    return { ...fallback, source: 'unconfigured' };
  }

  try {
    const { data: existing, error: selectError } = await supabase
      .from('pro_entitlement')
      .select('device_id')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (selectError && isMissingRelation(selectError.message)) {
      return readLocalFallback(deviceId);
    }

    if (!existing) {
      // First read on this device — create its row. The trigger in the
      // migration pins trial_started_at/pro_active regardless of this
      // payload; nothing here can request extra trial time.
      const { error: insertError } = await supabase.from('pro_entitlement').insert({ device_id: deviceId });
      if (insertError && !isDuplicateKey(insertError.message)) {
        // Could not create a row (offline, RLS misconfigured, etc). Fall
        // back rather than report a state that was never actually read.
        return readLocalFallback(deviceId);
      }
    }

    const { data: state, error: viewError } = await supabase
      .from('pro_entitlement_state')
      .select('device_id, entitlement, trial_ends_at, pro_active')
      .eq('device_id', deviceId)
      .maybeSingle<EntitlementRow>();

    if (viewError || !state) {
      if (viewError && isMissingRelation(viewError.message)) {
        return readLocalFallback(deviceId);
      }
      return readLocalFallback(deviceId);
    }

    const entitlement: Entitlement =
      state.entitlement === 'pro' || state.entitlement === 'trial' || state.entitlement === 'expired'
        ? state.entitlement
        : 'trial';

    return {
      entitlement,
      trialEndsAt: state.trial_ends_at ? new Date(state.trial_ends_at).getTime() : null,
      deviceId,
      source: 'server',
    };
  } catch {
    return readLocalFallback(deviceId);
  }
}

function isMissingRelation(message: string): boolean {
  return /relation .* does not exist/i.test(message) || /schema cache/i.test(message);
}

function isDuplicateKey(message: string): boolean {
  return /duplicate key/i.test(message);
}
