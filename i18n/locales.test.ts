import ar from './locales/ar.json';
import de from './locales/de.json';
import en from './locales/en.json';
import tr from './locales/tr.json';

type Tree = { [key: string]: string | Tree };

function flatten(node: Tree, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

/** i18next appends a plural category to the key it looks up, and Arabic genuinely has
 * more categories than English does — so `insights.squadImpactSummary_few` existing only
 * in ar.json is correct, not a stray key. Compared on the base key so those never read as
 * a mismatch in either direction. */
function baseKeys(node: Tree): Set<string> {
  return new Set(flatten(node).map((key) => key.replace(/_(zero|one|two|few|many|other)$/, '')));
}

const LOCALES: [string, Tree][] = [
  ['tr', tr as Tree],
  ['de', de as Tree],
  ['ar', ar as Tree],
];

const english = baseKeys(en as Tree);

describe('translation coverage', () => {
  it.each(LOCALES)('%s covers every English key', (_name, locale) => {
    const keys = baseKeys(locale);
    expect([...english].filter((key) => !keys.has(key))).toEqual([]);
  });

  it.each(LOCALES)('%s has no key English does not', (_name, locale) => {
    const keys = baseKeys(locale);
    expect([...keys].filter((key) => !english.has(key))).toEqual([]);
  });

  // The wide-window panes are the only place in the app that can be on screen with
  // nothing selected in them, so these four strings are the ones a missing translation
  // would leave as a raw key in front of a user.
  it.each([
    ['en', en as Tree],
    ...LOCALES,
  ])('%s translates the two-pane no-selection states', (_name, locale) => {
    const keys = baseKeys(locale);
    for (const key of [
      'explore.noSelectionTitle',
      'explore.noSelectionBody',
      'insights.noSelectionTitle',
      'insights.noSelectionBody',
    ]) {
      expect(keys.has(key)).toBe(true);
    }
  });
});
