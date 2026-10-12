import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { ownerToken } from '@/services/onuraiClient';

/**
 * RevenueCat — Android only, for Google Play Billing.
 *
 * IDENTITY IS THE SAME ONE VERA ALREADY KNOWS THIS DEVICE BY. RevenueCat's
 * `appUserID` is set to this device's existing Vera/OnurAI anonymous owner
 * token (see `services/onuraiClient.ts`'s `ownerToken()`) — never a second,
 * random or device-generated id — so a future RevenueCat → Vera webhook can
 * match a purchase back to the exact identity `services/entitlement.ts`
 * already reads. SportMind still has no accounts and this does not add any.
 *
 * WHY THE ANDROID KEY GATES EVERYTHING HERE, INCLUDING ON iOS. There is no
 * iOS RevenueCat key, and this module must not touch iOS at all — a
 * Play Store key handed to StoreKit would be a store/key mismatch, not a
 * harmless no-op. `isRevenueCatConfigured()` is the one gate every exported
 * function below checks first, and it is false on any platform other than
 * Android regardless of whether the (Android-only) key is set.
 *
 * WHAT THIS FILE DOES NOT DECIDE. Whether SportMind shows a device as "Pro"
 * is still `services/entitlement.ts`'s call (Vera's own 14-day trial, then
 * SportMind's own `sportmind_pro` entitlement — never account-wide) — see
 * that file and `contexts/EntitlementContext.tsx`. This module only answers
 * two narrower questions for that decision to use: which package to buy,
 * and whether *RevenueCat's own* record for this device currently has the
 * `sportmind_pro` entitlement — the second one lets a device that just paid
 * be recognized immediately, without waiting on a RevenueCat → Vera backend
 * sync this task does not build (see `services/purchase.ts`).
 */

/** Read live rather than cached at module-load time — EXPO_PUBLIC_* is
 * still inlined at build time in a real app (this changes nothing about
 * production behavior), but a live read means a test can flip
 * process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID between cases without
 * needing to force-reload this module and its own imports (Purchases,
 * ownerToken) back into separate mock instances. */
function androidApiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
}

/** The one entitlement this app ever checks RevenueCat for — configured on
 * the RevenueCat dashboard, never invented client-side.
 *
 * `sportmind_pro`, NOT the account-wide `Vera Pro` this used to read. Each
 * Vera application sells its own entitlement since 2026-09-10 — the backend
 * side of this is `apps/api/src/onurai_api/trials.py`'s
 * `TrialApplication("sportmind").entitlement_key`, and a RevenueCat
 * dashboard entitlement identifier that does not match it can never be
 * found in `customerInfo.entitlements.active`, so this device would never
 * widen past `expired` no matter what it paid for. Exported so
 * `services/purchase.ts` reads the same string rather than keeping its own
 * copy that can drift again. */
export const ENTITLEMENT_IDENTIFIER = 'sportmind_pro';

/** True only once a real Android key is present AND this is Android — see
 * this file's own header for why both must hold. */
export function isRevenueCatConfigured(): boolean {
  const key = androidApiKey();
  return Platform.OS === 'android' && Boolean(key && key.trim().length > 0);
}

let configured: Promise<void> | null = null;

/** Configure the RevenueCat SDK exactly once, with this device's existing
 * Vera identity as its `appUserID`. Safe to call repeatedly (subsequent
 * calls reuse the same in-flight/completed configuration) and a no-op
 * wherever `isRevenueCatConfigured()` is false. */
export async function ensureRevenueCatConfigured(): Promise<void> {
  if (!isRevenueCatConfigured()) return;
  if (!configured) {
    configured = (async () => {
      const appUserID = await ownerToken();
      Purchases.configure({ apiKey: androidApiKey() as string, appUserID });
    })();
  }
  return configured;
}

/** Test-only: forgets the cached configuration so a test can simulate a
 * fresh process. Never called from production code. */
export function __resetConfigurationForTests(): void {
  configured = null;
}

/**
 * The one real product this app offers — the `$rc_monthly` package inside
 * the RevenueCat dashboard's `default` Offering — resolved by RevenueCat's
 * own predefined package identifier rather than any product id written
 * here. `null` when not configured, or when the dashboard has no current
 * offering / no monthly package in it (an unavailable purchase, not a
 * thrown error).
 */
export async function getMonthlyPackage() {
  if (!isRevenueCatConfigured()) return null;
  await ensureRevenueCatConfigured();
  const offerings = await Purchases.getOfferings();
  const offering = offerings.current ?? offerings.all.default ?? null;
  return offering?.monthly ?? null;
}

/**
 * Whether RevenueCat's own record for this device currently has the
 * `sportmind_pro` entitlement active. Checked independently of
 * `services/entitlement.ts`'s `readEntitlement()` — see this file's header
 * for why both exist. Fails closed (`false`) on any error, same direction
 * as `services/entitlement.ts`'s own unreadable-answer handling: this value
 * only ever widens access (see `contexts/EntitlementContext.tsx`), so
 * failing closed here just means "don't widen it," never "lock someone
 * out."
 */
export async function hasActiveRevenueCatEntitlement(): Promise<boolean> {
  if (!isRevenueCatConfigured()) return false;
  try {
    await ensureRevenueCatConfigured();
    const customerInfo = await Purchases.getCustomerInfo();
    return Boolean(customerInfo.entitlements.active[ENTITLEMENT_IDENTIFIER]);
  } catch {
    return false;
  }
}
