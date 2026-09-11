import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/contexts/ThemeContext';

/**
 * Turns a screen's existing `StyleSheet.create({...})` into one that follows the active
 * appearance, with the style bodies left exactly as they were.
 *
 *     const useStyles = makeStyles((colors) => ({ card: { backgroundColor: colors.surface } }));
 *     // in the component:
 *     const styles = useStyles();
 *
 * The factory's parameter is deliberately named `colors` at every call site, so the
 * hundreds of `colors.textPrimary` references inside these sheets did not have to be
 * rewritten to adopt theming — only the wrapper around them changed. That is what keeps
 * the light build byte-identical to the one that shipped before dark mode existed.
 *
 * Each sheet is built once per palette and cached on the palette's own identity, so
 * switching appearance builds one new sheet per screen and switching back reuses the
 * first one. Nothing is rebuilt on an ordinary re-render.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: ThemeColors) => T) {
  const cache = new Map<ThemeColors, T>();
  return function useStyles(): T {
    const colors = useThemeColors();
    let sheet = cache.get(colors);
    if (!sheet) {
      sheet = StyleSheet.create(factory(colors));
      cache.set(colors, sheet);
    }
    return sheet;
  };
}
