import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'sportmind_profile_name';
const DEFAULT_NAME = 'Player';

type ProfileState = {
  name: string;
  setName: (name: string) => void;
};

const ProfileContext = createContext<ProfileState>({
  name: DEFAULT_NAME,
  setName: () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [name, setNameState] = useState(DEFAULT_NAME);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setNameState(stored);
    });
  }, []);

  const setName = (next: string) => {
    const trimmed = next.trim();
    const value = trimmed.length > 0 ? trimmed : DEFAULT_NAME;
    setNameState(value);
    AsyncStorage.setItem(STORAGE_KEY, value);
  };

  return <ProfileContext.Provider value={{ name, setName }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}
