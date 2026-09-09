import { readEntitlement, type EntitlementState } from '@/services/entitlement';

/**
 * Buying SportMind Pro: the seam, and an honest account of why nothing is
 * behind it yet — transplanted from Stylist's services/stylist/purchase.ts,
 * which is in exactly the same state: no billing SDK installed, no store
 * product created, no price configured on either platform.
 *
 * THERE IS NO PURCHASE SYSTEM IN THIS APP TODAY. This module is the shape
 * that work will take once a provider (RevenueCat, or direct StoreKit/Play
 * Billing) is chosen and a real product exists in App Store Connect /
 * Google Play Console. Nothing here invents a product id, a price, a
 * currency or a billing period — see PHASE 17 in the report this ships
 * with for exactly what is missing and where it has to be created.
 *
 * SportMind Pro's price is a real business requirement — 49.99 — but that
 * number is what must be entered when the store product is created, not
 * something this file renders. A number typed into this file would be
 * wrong for most of the world on the day it shipped and wrong for
 * everybody the day the price changed; the paywall screen renders nothing
 * in the price's place until isPurchaseConfigured() is true and a real,
 * store-supplied, localised price string exists to show.
 *
 * THE AUTHORITY IS THE SHARED, ACCOUNT-WIDE ENTITLEMENT, AND THIS FILE IS
 * NOT IT. Exactly like Stylist: a provider confirming a purchase would be
 * evidence that money moved, never a decision that this device is Pro. The
 * only thing that may conclude that is a re-read of readEntitlement() —
 * see services/entitlement.ts and apps/api's onurai_api.entitlements — after
 * the provider (once one exists) has told that one shared backend, which
 * unlocks Pro for Stylist, Mutfak and SportMind together, not this
 * Specialist alone.
 */

/**
 * Whether a purchase can be started at all. False today, for the same
 * reason it is false in Stylist: read rather than assumed by every surface
 * that would offer to buy, so a "Go Pro" button that opened nothing never
 * exists — the purchase actions on the paywall are conditioned on this and
 * appear by themselves once a provider is wired in.
 */
export function isPurchaseConfigured(): boolean {
  return false;
}

/** How a purchase attempt ended. `cancelled` is not a failure — the person
 * answered nothing, so nothing should be said to them. `pending` is not a
 * failure either: see completePurchase below. */
export type PurchaseOutcome =
  | { ok: true; entitlement: EntitlementState }
  | { ok: false; reason: 'unavailable' | 'cancelled' | 'failed' | 'pending' };

/**
 * Start a purchase, or say that there is none to start. The provider call
 * (RevenueCat.purchasePackage, or the platform SDK directly) goes inside the
 * guarded branch below once isPurchaseConfigured() can be true; its result
 * would feed completePurchase, which is what actually decides anything.
 */
export async function startPurchase(): Promise<PurchaseOutcome> {
  if (!isPurchaseConfigured()) {
    return { ok: false, reason: 'unavailable' };
  }
  /* THE PROVIDER CALL GOES HERE, and only here, once one is chosen. */
  return { ok: false, reason: 'unavailable' };
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
  return { ok: false, reason: 'unavailable' };
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
