/**
 * Appearance preference — the pure part, with no React and no storage in it, so it can be
 * tested directly the way the rest of this app's logic is (see data/dataConfidence.ts,
 * services/entitlement.ts).
 */

export const APPEARANCE_MODES = ['system', 'light', 'dark'] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

/** Resolved appearance — what the UI actually paints, once "system" has been answered. */
export type ColorScheme = 'light' | 'dark';

/** One canonical key, in this app's existing `sportmind_*` namespace, kept away from
 *  every other stored preference so clearing one never disturbs another. */
export const APPEARANCE_STORAGE_KEY = 'sportmind_appearance_mode';

/** What a brand-new install gets. */
export const DEFAULT_APPEARANCE_MODE: AppearanceMode = 'dark';

/** What an install that predates the Dark default keeps: before it existed, never having
 *  chosen an appearance meant following the device, and that must not silently change. */
export const LEGACY_APPEARANCE_MODE: AppearanceMode = 'system';

/**
 * Which mode to start in, from what storage held and whether this install has already been
 * through Welcome.
 *
 *  - A stored Light/Dark/System choice always wins and is never rewritten.
 *  - Nothing (or something unreadable) stored on a brand-new install: Dark, and `persist`
 *    says to write it down — otherwise the very next launch, once Welcome has been seen,
 *    would look like an existing install and flip to System.
 *  - Nothing stored on an install that has already seen Welcome: it predates the Dark
 *    default and never chose, so it keeps following the device and nothing is written.
 */
export function resolveInitialAppearance(
  stored: string | null | undefined,
  hasSeenWelcome: boolean,
): { mode: AppearanceMode; persist: boolean } {
  if ((APPEARANCE_MODES as readonly string[]).includes(stored ?? '')) {
    return { mode: stored as AppearanceMode, persist: false };
  }
  if (hasSeenWelcome) return { mode: LEGACY_APPEARANCE_MODE, persist: false };
  return { mode: DEFAULT_APPEARANCE_MODE, persist: true };
}

/**
 * The one place "system" is turned into a real appearance.
 *
 * `systemScheme` is whatever React Native reports for the device right now, which is
 * legitimately null before the OS has answered — treated as light, the same assumption
 * the platform itself makes, rather than flashing dark and back.
 */
export function resolveScheme(mode: AppearanceMode, systemScheme: ColorScheme | null | undefined): ColorScheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return systemScheme === 'dark' ? 'dark' : 'light';
}
