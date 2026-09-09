/**
 * What this device is entitled to, asked of the one thing that knows.
 *
 * REPLACES A SEPARATE, SUPABASE-ONLY IMPLEMENTATION that was built and
 * committed concurrently with this task (commit "feat: add SportMind Pro
 * monetization"), then superseded by an explicit product decision: Pro is
 * ONE shared, account-wide entitlement across Stylist, Mutfak and SportMind
 * — a purchase on any one of them unlocks all three — rather than each
 * Specialist owning a separate premium flag in its own database. That
 * decision is what this file implements; the Supabase table/migration the
 * earlier version added (`backend/sql/pro_entitlement.sql`) is removed
 * because it would otherwise be a second, disconnected notion of "Pro" that
 * a purchase through the shared path would never update.
 *
 * PORTED FROM THE STYLIST CLIENT'S OWN `entitlement.ts` — same shape, same
 * rule: THE SERVER DECIDES AND THIS ONLY READS. `entitlement` is `pro`,
 * `trial` or `expired`, computed on the backend from a stored start instant
 * and its own clock; nothing here derives it.
 *
 * IDENTITY IS SPORTMIND'S OWN, NEW ANONYMOUS SESSION — see
 * `services/onuraiClient.ts` — because this app has never had any other. It
 * is the same generic mechanism Mutfak already uses, reached for the first
 * time, not a new one invented for SportMind.
 *
 * SPORTMIND'S OWN TRIAL, NOT A SHARED ONE. `plan` (what was paid for) is one
 * account-wide answer, the same for every Specialist; `entitlement` here is
 * SportMind's OWN independent fourteen-day clock — see
 * `apps/api/src/onurai_api/routers/billing.py`'s `application=sportmind`
 * handling, which starts it on this device's first entitlement read (the
 * only authenticated touch this Specialist has on the platform at all).
 *
 * NOT CACHED HERE, for the same reason Stylist's own module gives: entitlement
 * changes the moment a purchase settles, and a stale local copy is exactly
 * what would leave somebody who just paid still looking at a paywall.
 */

import { onuraiApi, ApiError } from '@/services/onuraiClient';
import { legacyTrialWasAlreadyUsedUp } from '@/services/legacyTrialMigration';

/** The three states the backend reports. A closed set, never derived here. */
export type Entitlement = 'pro' | 'trial' | 'expired';

export interface EntitlementState {
  entitlement: Entitlement;
  /** What was PAID for — a different question from what this device is
   * entitled to; a device inside its trial has paid for nothing and is
   * fully entitled. Not read by anything today; carried for parity with
   * the Stylist/Mutfak clients' own EntitlementState shape. */
  plan: string;
  /** Epoch milliseconds (this file's own unit, matching the previous
   * Supabase-based EntitlementState so EntitlementContext.tsx needed no
   * change), or null when no trial has started yet. */
  trialEndsAt: number | null;
}

interface WireEntitlement {
  plan?: unknown;
  entitlement?: unknown;
  trial_ends_at?: unknown;
}

const STATES: ReadonlySet<string> = new Set(['pro', 'trial', 'expired']);

/**
 * Read it. An unreadable answer — no anonymous session could be minted, a
 * network failure, an older/newer server — answers `trial`, the unblocking
 * state, for the same reason Stylist's own `readEntitlement` gives: this
 * value only decides what is OFFERED, never what is allowed, and failing
 * closed here would lock people out of a working product over a transient
 * error.
 */
export async function readEntitlement(): Promise<EntitlementState> {
  try {
    const wire = await onuraiApi<WireEntitlement>('/v1/entitlement?application=sportmind');
    let state = typeof wire.entitlement === 'string' && STATES.has(wire.entitlement)
      ? (wire.entitlement as Entitlement)
      : 'trial';

    // ONE-TIME COMPATIBILITY CHECK, NOT A NEW SOURCE OF TRUTH. A device that
    // already used up its OLD, pre-Vera local trial must not be handed a
    // second, full fourteen days just because the identity underneath it
    // changed — see legacyTrialMigration.ts for the full reasoning and why
    // this can only ever narrow access, never grant it. Only overrides a
    // FRESH server `trial` down to `expired`; a real `pro` or an
    // already-`expired` server answer is never touched.
    if (state === 'trial' && (await legacyTrialWasAlreadyUsedUp())) {
      state = 'expired';
    }

    return {
      entitlement: state,
      plan: typeof wire.plan === 'string' ? wire.plan : 'free',
      trialEndsAt: typeof wire.trial_ends_at === 'number' ? wire.trial_ends_at * 1000 : null,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // No identity could be established at all (anonymous sessions
      // unconfigured on this deployment, or offline on first launch).
      // Trial, not expired — see this function's own header.
    }
    return { entitlement: 'trial', plan: 'free', trialEndsAt: null };
  }
}
