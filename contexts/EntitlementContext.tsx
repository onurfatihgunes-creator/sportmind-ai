import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { readEntitlement, type Entitlement } from '@/services/entitlement';

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

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<EntitlementStatus>('loading');
  const [trialEndsAt, setTrialEndsAt] = useState<number | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const state = await readEntitlement();
    if (!mounted.current) return;
    setStatus(state.entitlement);
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
