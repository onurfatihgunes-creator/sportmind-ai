import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import * as mock from '@/data/mockData';
import type { ChangeEvent, Insight, Match, Team } from '@/data/mockData';
import { fetchLiveData } from '@/data/liveData';

type AppData = {
  teams: Record<string, Team>;
  matches: Match[];
  insights: Insight[];
  changeEvents: ChangeEvent[];
  /** True once real Supabase data has loaded and replaced the mock data. */
  isLive: boolean;
  loading: boolean;
};

const initialState: AppData = {
  teams: mock.teams,
  matches: mock.matches,
  insights: mock.insights,
  changeEvents: mock.changeEvents,
  isLive: false,
  loading: true,
};

const DataContext = createContext<AppData>(initialState);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppData>(initialState);

  useEffect(() => {
    let cancelled = false;
    fetchLiveData().then((live) => {
      if (cancelled) return;
      if (live) {
        setState({ ...live, isLive: true, loading: false });
      } else {
        setState((s) => ({ ...s, loading: false }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

export function useAppData() {
  return useContext(DataContext);
}
