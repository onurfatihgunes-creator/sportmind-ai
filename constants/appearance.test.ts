import {
  DEFAULT_APPEARANCE_MODE,
  LEGACY_APPEARANCE_MODE,
  resolveInitialAppearance,
  resolveScheme,
} from './appearance';

describe('resolveInitialAppearance', () => {
  it('defaults a brand-new install (nothing stored, Welcome not seen) to Dark and says to persist it', () => {
    expect(DEFAULT_APPEARANCE_MODE).toBe('dark');
    expect(resolveInitialAppearance(null, false)).toEqual({ mode: 'dark', persist: true });
    expect(resolveInitialAppearance(undefined, false)).toEqual({ mode: 'dark', persist: true });
  });

  it('never overrides a saved Light, System or Dark choice, and never rewrites it', () => {
    for (const hasSeenWelcome of [false, true]) {
      expect(resolveInitialAppearance('light', hasSeenWelcome)).toEqual({ mode: 'light', persist: false });
      expect(resolveInitialAppearance('system', hasSeenWelcome)).toEqual({ mode: 'system', persist: false });
      expect(resolveInitialAppearance('dark', hasSeenWelcome)).toEqual({ mode: 'dark', persist: false });
    }
  });

  it('keeps an install that predates the Dark default (Welcome already seen, nothing stored) on System', () => {
    expect(LEGACY_APPEARANCE_MODE).toBe('system');
    expect(resolveInitialAppearance(null, true)).toEqual({ mode: 'system', persist: false });
  });

  it('treats an unreadable stored value like nothing stored', () => {
    expect(resolveInitialAppearance('sepia', false)).toEqual({ mode: 'dark', persist: true });
    expect(resolveInitialAppearance('', true)).toEqual({ mode: 'system', persist: false });
  });

  it('resolves System against the device scheme, treating an unknown device scheme as light', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});
