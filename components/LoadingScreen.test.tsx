/**
 * The loading screen's contract: honest (indeterminate bar, never a percentage), reports the real
 * stage, never leaves the person stuck without a way out, and respects reduced motion.
 */
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import LoadingScreen, { SLOW_HINT_AFTER_MS } from './LoadingScreen';

let mockReducedMotion = false;
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<object>('react-native-reanimated/mock'),
  useReducedMotion: () => mockReducedMotion,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockReducedMotion = false;
});
afterEach(() => jest.useRealTimers());

function mount(state: 'loading' | 'error', onRetry = jest.fn(), onContinue = jest.fn()) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(<LoadingScreen state={state} onRetry={onRetry} onContinue={onContinue} />);
  });
  return { r, onRetry, onContinue };
}

const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));

test('loading: brand, an indeterminate progress bar and the real stage — no percentage anywhere', () => {
  const { r } = mount('loading');
  const all = texts(r).join(' | ');
  expect(all).toContain('SportMind');
  expect(all).toContain('loading.statusAnalyses');
  expect(all).not.toMatch(/\d+\s*%/);
  const bar = r.root.findAll((n) => n.props.accessibilityRole === 'progressbar')[0];
  expect(bar).toBeDefined();
  // Indeterminate: a determinate bar would carry an accessibilityValue (now/max).
  expect(bar.props.accessibilityValue).toBeUndefined();
});

test('after SLOW_HINT_AFTER_MS of real waiting the status line says it is slow — nothing is faked', () => {
  const { r } = mount('loading');
  expect(texts(r).join('|')).not.toContain('loading.statusSlow');
  act(() => jest.advanceTimersByTime(SLOW_HINT_AFTER_MS + 10));
  expect(texts(r).join('|')).toContain('loading.statusSlow');
});

test('error: plain message with Retry and Continue offline, wired to the callbacks', () => {
  const { r, onRetry, onContinue } = mount('error');
  const all = texts(r).join(' | ');
  expect(all).toContain('loading.errorTitle');
  expect(all).toContain('loading.retry');
  expect(all).toContain('loading.continueOffline');
  expect(r.root.findAll((n) => n.props.accessibilityRole === 'progressbar')).toHaveLength(0);
  const buttons = r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
  act(() => buttons[0].props.onPress());
  act(() => buttons[1].props.onPress());
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onContinue).toHaveBeenCalledTimes(1);
});

test('reduced motion: still renders everything, just without the looping animations', () => {
  mockReducedMotion = true;
  const { r } = mount('loading');
  expect(texts(r).join(' | ')).toContain('loading.statusAnalyses');
  expect(r.root.findAll((n) => n.props.accessibilityRole === 'progressbar').length).toBeGreaterThan(0);
});
