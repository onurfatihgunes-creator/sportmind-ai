import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'sportmind_followed_team_ids';

export const MAX_FOLLOWED_TEAMS = 3;

type FollowedTeamsState = {
  teamIds: string[];
  isFollowed: (id: string) => boolean;
  toggle: (id: string) => void;
  canFollowMore: boolean;
};

const FollowedTeamsContext = createContext<FollowedTeamsState>({
  teamIds: [],
  isFollowed: () => false,
  toggle: () => {},
  canFollowMore: true,
});

export function FollowedTeamsProvider({ children }: { children: ReactNode }) {
  const [teamIds, setTeamIds] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setTeamIds(JSON.parse(raw));
    });
  }, []);

  const toggle = (id: string) => {
    setTeamIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((t) => t !== id);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      }
      if (prev.length >= MAX_FOLLOWED_TEAMS) return prev;
      const next = [...prev, id];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <FollowedTeamsContext.Provider
      value={{
        teamIds,
        isFollowed: (id) => teamIds.includes(id),
        toggle,
        canFollowMore: teamIds.length < MAX_FOLLOWED_TEAMS,
      }}
    >
      {children}
    </FollowedTeamsContext.Provider>
  );
}

export function useFollowedTeams() {
  return useContext(FollowedTeamsContext);
}
