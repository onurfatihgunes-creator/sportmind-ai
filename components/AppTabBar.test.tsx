/**
 * Regression coverage for the Android bottom bar: expo-blur only blurs on iOS, so on
 * Android the bar was a translucent plain View and screen content showed through it,
 * colliding with the tab labels. Android must paint an opaque, theme-aware surface;
 * iOS must keep the BlurView and add no solid background.
 */
import type { ComponentProps } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppTabBar from './AppTabBar';
import { AppThemeProvider } from '@/contexts/ThemeContext';
import { APPEARANCE_STORAGE_KEY } from '@/constants/appearance';
import { darkColors, lightColors } from '@/constants/theme';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<object>('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

const routes = [
  { key: 'index-1', name: 'index' },
  { key: 'explore-1', name: 'explore' },
  { key: 'insights-1', name: 'insights' },
  { key: 'profile-1', name: 'profile' },
];

function props(): ComponentProps<typeof AppTabBar> {
  const descriptors = Object.fromEntries(routes.map((r) => [r.key, { options: { title: r.name } }]));
  return {
    state: { routes, index: 0 },
    descriptors,
    navigation: { emit: () => ({ defaultPrevented: false }), navigate: () => {} },
  } as unknown as ComponentProps<typeof AppTabBar>;
}

async function render(): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <AppThemeProvider>
        <AppTabBar {...props()} />
      </AppThemeProvider>,
    );
  });
  return renderer;
}

function rootBackground(renderer: TestRenderer.ReactTestRenderer): string | undefined {
  const root = renderer.toJSON() as unknown as { props: { style: unknown } };
  return (StyleSheet.flatten(root.props.style as never) as { backgroundColor?: string }).backgroundColor;
}

afterEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

test('Android: opaque surface background, no BlurView — content cannot show through the bar', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const renderer = await render();
  expect(rootBackground(renderer)).toBe(lightColors.surface);
  expect(renderer.root.findAllByType(BlurView)).toHaveLength(0);
});

test('Android: the surface follows the dark theme', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark');
  const renderer = await render();
  expect(rootBackground(renderer)).toBe(darkColors.surface);
});

test('iOS: keeps the BlurView and adds no solid background', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const renderer = await render();
  expect(rootBackground(renderer)).toBeUndefined();
  expect(renderer.root.findAllByType(BlurView)).toHaveLength(1);
});
