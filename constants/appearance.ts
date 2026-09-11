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

export const DEFAULT_APPEARANCE_MODE: AppearanceMode = 'system';

/**
 * What was read back from storage, made safe. Anything that isn't one of the three real
 * modes — a value from a future version, a half-written string, a key some other feature
 * happened to collide with — falls back to the default rather than leaving the app in an
 * appearance it cannot name.
 */
export function parseStoredMode(stored: string | null | undefined): AppearanceMode {
  return (APPEARANCE_MODES as readonly string[]).includes(stored ?? '')
    ? (stored as AppearanceMode)
    : DEFAULT_APPEARANCE_MODE;
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
