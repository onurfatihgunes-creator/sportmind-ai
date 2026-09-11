import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_MODE,
  parseStoredMode,
  resolveScheme,
  type AppearanceMode,
  type ColorScheme,
} from '@/constants/appearance';
import { palettes, type ThemeColors } from '@/constants/theme';

/** What the user picked. Re-exported under the name the screens already import. */
export type ThemeMode = AppearanceMode;

export type { ColorScheme, ThemeColors };

type AppThemeState = {
  /** 'system' | 'light' | 'dark' — the stored preference. */
  mode: ThemeMode;
  /** What that resolves to right now; the only thing the UI should paint from. */
  scheme: ColorScheme;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
};

/**
 * ONE SOURCE OF TRUTH for appearance. No screen calls useColorScheme() or Appearance
 * directly — this provider is the only place the device setting is consulted, so
 * "system" can be overridden coherently and every surface agrees on the answer.
 *
 * Deliberately holds nothing else: it never touches data, auth, entitlement or the
 * adaptive layout, so changing appearance cannot reload anything or move a pane.
 */
const AppThemeContext = createContext<AppThemeState>({
  mode: DEFAULT_APPEARANCE_MODE,
  scheme: 'light',
  colors: palettes.light,
  setMode: () => {},
});

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_APPEARANCE_MODE);

  // Read once at mount. A stored value that is not one of the three real modes is
  // discarded by parseStoredMode rather than trusted — see its own note.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(APPEARANCE_STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      const parsed = parseStoredMode(stored);
      if (parsed !== DEFAULT_APPEARANCE_MODE) setModeState(parsed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // State first, storage after: the switch has to feel instant, and a write that loses a
  // race with app termination costs a preference, not a frame.
  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, next);
  }, []);

  const scheme = resolveScheme(mode, systemScheme);

  // Stable identity per (mode, scheme): the palette reference is what a memoised
  // createStyles/useThemedStyles caches on, so a re-render that changes neither must not
  // hand out a new object and quietly rebuild every StyleSheet in the app.
  const value = useMemo<AppThemeState>(
    () => ({ mode, scheme, colors: palettes[scheme], setMode }),
    [mode, scheme, setMode],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(AppThemeContext);
}

/** The palette alone, for a component that only needs colours. */
export function useThemeColors(): ThemeColors {
  return useContext(AppThemeContext).colors;
}
