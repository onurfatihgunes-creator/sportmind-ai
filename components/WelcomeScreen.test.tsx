/**
 * Regression for "Get started" sitting below the fold: the CTA must live outside the scrolling
 * content (so it is always on screen and takes the first touch), the content must still scroll,
 * and a double tap must not finish twice.
 */
import { ScrollView } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import WelcomeScreen, { welcomeHeroHeight } from './WelcomeScreen';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<object>('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  };
});
jest.mock('@/components/OnboardingHero', () => () => null);
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

function render(onFinish: () => void | Promise<void>) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(<WelcomeScreen onFinish={onFinish} />);
  });
  return r;
}

const isScrollView = (type: unknown) => {
  const t = type as { displayName?: string; name?: string } | string;
  return t === ScrollView || (typeof t !== 'string' && (t?.displayName === 'ScrollView' || t?.name === 'ScrollView'));
};

function insideScrollView(node: TestRenderer.ReactTestInstance) {
  for (let n = node.parent; n; n = n.parent) if (isScrollView(n.type)) return true;
  return false;
}

const cta = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];

test('the Get started button is not inside the scrolling content', () => {
  const r = render(() => {});
  expect(cta(r)).toBeDefined();
  expect(insideScrollView(cta(r))).toBe(false);
});

test('the hero and copy still scroll', () => {
  const r = render(() => {});
  expect(r.root.findAll((n) => isScrollView(n.type))).not.toHaveLength(0);
});

describe('welcomeHeroHeight (copy must not be cut off on short screens)', () => {
  test('before the copy and footer are measured it keeps the normal height', () => {
    expect(welcomeHeroHeight(700, 0, 0)).toBe(406);
    expect(welcomeHeroHeight(700, 330, 0)).toBe(406);
  });

  test('a tall screen keeps the normal height when the copy fits under it', () => {
    // 1000 * 0.58 = 580; copy 330 + footer 84 leaves 586, so nothing shrinks.
    expect(welcomeHeroHeight(1000, 330, 84)).toBe(580);
  });

  test('a short screen shrinks the hero to the space the copy leaves', () => {
    expect(welcomeHeroHeight(740, 330, 84)).toBe(326);
    expect(welcomeHeroHeight(657, 330, 84)).toBe(280); // would be 243; clamped to the minimum
  });

  test('never below the compact minimum, and never above the normal height', () => {
    expect(welcomeHeroHeight(500, 400, 84)).toBe(280);
    expect(welcomeHeroHeight(1400, 100, 84)).toBe(812);
  });
});

test('tapping Get started finishes once, even on a double tap', () => {
  const onFinish = jest.fn();
  const r = render(onFinish);
  act(() => {
    cta(r).props.onPress();
    cta(r).props.onPress();
  });
  expect(onFinish).toHaveBeenCalledTimes(1);
});

test('a failed finish can be retried', async () => {
  const onFinish = jest.fn().mockRejectedValueOnce(new Error('storage')).mockResolvedValue(undefined);
  const r = render(onFinish);
  await act(async () => {
    cta(r).props.onPress();
  });
  await act(async () => {
    cta(r).props.onPress();
  });
  expect(onFinish).toHaveBeenCalledTimes(2);
});
