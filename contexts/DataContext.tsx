import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as mock from '@/data/mockData';
import type { AnalysisChangeEvent, ChangeEvent, Match, Team, TrackRecordEntry } from '@/data/mockData';
import { fetchLiveData } from '@/data/liveData';
import { supabase } from '@/lib/supabase';

/**
 * Where the initial load is:
 *  - 'loading': the fetch is in flight.
 *  - 'ready':   live data arrived (or there is no backend configured, i.e. the developer demo).
 *  - 'failed':  the fetch errored, came back empty, or took longer than INITIAL_LOAD_TIMEOUT_MS.
 *               The app still holds the demo/mock data, so continuing past this is the existing
 *               offline behaviour (Home's "Demo data" badge); a late answer still upgrades to live.
 */
export type DataStatus = 'loading' | 'ready' | 'failed';

/** Longest the first load may keep the loading screen up before it offers Retry — Supabase's
 *  client has no timeout of its own, so without this a dead connection would spin forever. */
export const INITIAL_LOAD_TIMEOUT_MS = 12_000;

type AppData = {
  teams: Record<string, Team>;
  matches: Match[];
  changeEvents: ChangeEvent[];
  analysisChanges: AnalysisChangeEvent[];
  trackRecord: TrackRecordEntry[];
  /** True once real Supabase data has loaded and replaced the mock data. */
  isLive: boolean;
  /** True only while the fetch is in flight (false for 'ready' and 'failed'). */
  loading: boolean;
  status: DataStatus;
  /** Start the load again — a no-op for the fetch itself unless the caller taps Retry. */
  retry: () => void;
};

type DataState = Omit<AppData, 'retry'>;

const initialState: DataState = {
  teams: mock.teams,
  matches: mock.matches,
  changeEvents: mock.changeEvents,
  analysisChanges: mock.analysisChanges,
  trackRecord: mock.trackRecord,
  isLive: false,
  loading: true,
  status: 'loading',
};

const DataContext = createContext<AppData>({ ...initialState, retry: () => {} });

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>(initialState);
  const attempt = useRef(0);
  const mounted = useRef(true);

  const load = useCallback(() => {
    const id = ++attempt.current;
    const current = () => mounted.current && attempt.current === id;

    setState((s) => (s.status === 'loading' ? s : { ...s, loading: true, status: 'loading' }));

    const timer = setTimeout(() => {
      if (current()) setState((s) => (s.status === 'loading' ? { ...s, loading: false, status: 'failed' } : s));
    }, INITIAL_LOAD_TIMEOUT_MS);

    fetchLiveData()
      .catch(() => null)
      .then((live) => {
        clearTimeout(timer);
        if (!current()) return;
        if (live) {
          setState({ ...live, isLive: true, loading: false, status: 'ready' });
        } else {
          // No backend configured is the developer demo, not an error; a configured backend
          // that gave us nothing is.
          setState((s) => ({ ...s, loading: false, status: supabase ? 'failed' : 'ready' }));
        }
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const value = useMemo<AppData>(() => ({ ...state, retry: load }), [state, load]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData() {
  return useContext(DataContext);
}
