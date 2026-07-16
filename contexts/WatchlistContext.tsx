import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'sportmind_watchlist_match_ids';

type WatchlistState = {
  matchIds: string[];
  isWatched: (id: string) => boolean;
  toggle: (id: string) => void;
};

const WatchlistContext = createContext<WatchlistState>({
  matchIds: [],
  isWatched: () => false,
  toggle: () => {},
});

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [matchIds, setMatchIds] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setMatchIds(JSON.parse(raw));
    });
  }, []);

  const toggle = (id: string) => {
    setMatchIds((prev) => {
      const next = prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <WatchlistContext.Provider value={{ matchIds, isWatched: (id) => matchIds.includes(id), toggle }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  return useContext(WatchlistContext);
}
