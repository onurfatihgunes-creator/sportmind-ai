import { readEntitlement, type EntitlementState } from '@/services/entitlement';
import { getMonthlyPackage, isRevenueCatConfigured as isRevenueCatReady } from '@/services/revenueCat';
import Purchases from 'react-native-purchases';

/**
 * Buying SportMind Pro: the seam. Purchases now really flow through
 * RevenueCat on Android (see services/revenueCat.ts) once a real Android
 * public SDK key is configured — `isPurchaseConfigured()` follows that
 * directly rather than a hardcoded false. There is still no iOS provider
 * and still no purchase system there at all; see services/revenueCat.ts's
 * own header for why the Android-only key gates every function here too.
 *
 * THE PRODUCT ITSELF IS NEVER NAMED HERE. `startPurchase()` resolves the
 * one real package (`getMonthlyPackage()` — RevenueCat's own `$rc_monthly`
 * inside its `default` Offering) rather than this file hardcoding a product
 * id, a price, or a currency; that mapping lives entirely on the
 * RevenueCat/Google Play Console dashboards.
 *
 * THE AUTHORITY IS STILL SPORTMIND'S OWN `sportmind_pro` ENTITLEMENT, AND
 * THIS FILE IS STILL NOT IT — never the account-wide `Vera Pro` this file
 * used to check. RevenueCat confirming a purchase is evidence that money
 * moved, never itself the decision that this device is Pro — only a
 * re-read of readEntitlement() may conclude that (see
 * services/entitlement.ts). Nothing in this task wires a RevenueCat → Vera
 * webhook, so immediately after a real purchase that re-read can
 * legitimately still answer trial/expired until that backend-to-backend
 * sync exists — completePurchase() below already treats that as `pending`,
 * not `failed`, for exactly this reason. See
 * contexts/EntitlementContext.tsx for where that gap is bridged in the
 * meantime: if Vera's own answer is `expired` but RevenueCat's own record
 * for this device already shows `sportmind_pro` active, the UI still shows
 * Pro rather than a paywall a device that just paid should never see.
 */

/**
 * Whether a purchase can be started at all — true only once RevenueCat has
 * a real Android key configured (see services/revenueCat.ts). Read rather
 * than assumed by every surface that would offer to buy, so a "Go Pro"
 * button that opens nothing never exists.
 */
export function isPurchaseConfigured(): boolean {
  return isRevenueCatReady();
}

/** How a purchase attempt ended. `cancelled` is not a failure — the person
 * answered nothing, so nothing should be said to them. `pending` is not a
 * failure either: see completePurchase below. */
export type PurchaseOutcome =
  | { ok: true; entitlement: EntitlementState }
  | { ok: false; reason: 'unavailable' | 'cancelled' | 'failed' | 'pending' };

/**
 * Start a purchase: resolve the one real monthly package, buy it through
 * RevenueCat, and — as a sanity check that the dashboard's package really
 * did grant what it promises, not the app-wide access decision itself —
 * confirm RevenueCat's own result already shows `sportmind_pro` active
 * before handing off to completePurchase(), which is what actually decides
 * anything (see this file's header).
 */
export async function startPurchase(): Promise<PurchaseOutcome> {
  if (!isPurchaseConfigured()) {
    return { ok: false, reason: 'unavailable' };
  }
  const monthly = await getMonthlyPackage();
  if (!monthly) {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(monthly);
    if (!customerInfo.entitlements.active.sportmind_pro) {
      // The store purchase itself went through but RevenueCat's own record
      // does not yet show the entitlement — evidence money moved, not a
      // reason to tell the person it failed (see this file's header).
      return { ok: false, reason: 'pending' };
    }
  } catch (error) {
    if ((error as { userCancelled?: boolean } | null)?.userCancelled) {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'failed' };
  }
  return completePurchase();
}

/**
 * Restore a subscription somebody already has — required by both stores,
 * not a convenience: a reinstall or a new device must be able to say "I
 * already paid." Ends the same way a purchase does, by re-asking the real
 * source of truth, because "the provider found a receipt" is evidence, not
 * a decision.
 */
export async function restorePurchases(): Promise<PurchaseOutcome> {
  if (!isPurchaseConfigured()) {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    await Purchases.restorePurchases();
  } catch {
    return { ok: false, reason: 'failed' };
  }
  return completePurchase();
}

/**
 * Ask the entitlement source what changed, and let it be the one to say
 * "pro." Called after a provider confirms a purchase — see the header for
 * why this, and only this, may unlock anything.
 *
 * `pending` rather than `failed` on a re-read that still says trial/expired:
 * a webhook-driven backend update (once one exists) is asynchronous, so a
 * refresh moments after payment can legitimately still report the old
 * state. The money would have moved; saying the purchase failed here would
 * be the worst sentence on the screen.
 */
export async function completePurchase(): Promise<PurchaseOutcome> {
  try {
    const entitlement = await readEntitlement();
    if (entitlement.entitlement === 'pro') {
      return { ok: true, entitlement };
    }
    return { ok: false, reason: 'pending' };
  } catch {
    return { ok: false, reason: 'pending' };
  }
}
