import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { readEntitlement, type Entitlement } from '@/services/entitlement';
import { hasActiveRevenueCatEntitlement } from '@/services/revenueCat';

/**
 * The one authoritative subscription state for the whole app (Stylist's
 * PHASE 9 equivalent: "UI reads entitlement, entitlement decides access" —
 * no screen or component may keep its own local "am I premium" flag).
 *
 * `'loading'` IS ITS OWN STATE, NOT A DEFAULT GUESS. Exactly like Stylist's
 * Profile screen keeping entitlement as `null` until the server answers:
 * defaulting to 'trial' would let a component render full access before
 * this device's real state is known, and defaulting to 'expired' would
 * flash a paywall at a subscriber on every cold start. Screens that gate on
 * this must treat 'loading' as "allow, provisionally" — see
 * app/match/[id].tsx — the same fail-open Stylist documents for an
 * unreadable entitlement answer.
 */
export type EntitlementStatus = 'loading' | Entitlement;

interface EntitlementContextValue {
  status: EntitlementStatus;
  trialEndsAt: number | null;
  /** Re-read the entitlement source. Called after a purchase/restore
   * attempt and on returning to the foreground — never polled on a timer,
   * since nothing here needs to be that fresh and a timer would just be
   * background network traffic for its own sake. */
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextValue>({
  status: 'loading',
  trialEndsAt: null,
  refresh: async () => {},
});

/**
 * Vera's own 14-day trial/Pro decision is untouched and still governs
 * everything except this one case: this task wires no RevenueCat → Vera
 * webhook, so a device that just bought SportMind Pro through Google Play
 * can have Vera's own answer still say `expired` for a while. Checked only
 * when Vera has already said the trial is over — during the trial, Vera's
 * own answer stands exactly as before — and only to widen access, never
 * narrow it: `hasActiveRevenueCatEntitlement` resolving false (iOS, no key,
 * or not yet reporting the purchase) simply leaves Vera's `expired` answer
 * standing, which is the existing paywall behavior. A pure function so this
 * one decision is directly testable without rendering the provider.
 */
export function resolveDisplayedEntitlement(veraEntitlement: Entitlement, revenueCatActive: boolean): Entitlement {
  return veraEntitlement === 'expired' && revenueCatActive ? 'pro' : veraEntitlement;
}

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<EntitlementStatus>('loading');
  const [trialEndsAt, setTrialEndsAt] = useState<number | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const state = await readEntitlement();
    // Only asked when Vera has already said the trial is over — during the
    // trial itself, Vera's own answer decides everything and this call
    // (and its network round trip) never happens.
    const revenueCatActive = state.entitlement === 'expired' ? await hasActiveRevenueCatEntitlement() : false;
    if (!mounted.current) return;
    setStatus(resolveDisplayedEntitlement(state.entitlement, revenueCatActive));
    setTrialEndsAt(state.trialEndsAt);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    // Re-check on returning to the foreground — the case that matters most
    // is coming back from the App/Play Store's own purchase sheet, which
    // this app never fully backgrounds-and-loses like a killed process, so
    // a plain focus/foreground re-read is enough without app-restart-only
    // machinery.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      mounted.current = false;
      sub.remove();
    };
  }, [refresh]);

  return (
    <EntitlementContext.Provider value={{ status, trialEndsAt, refresh }}>{children}</EntitlementContext.Provider>
  );
}

export function useEntitlement() {
  return useContext(EntitlementContext);
}
