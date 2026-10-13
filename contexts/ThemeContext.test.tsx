/**
 * The provider half of the Dark default: what it reads at startup, what it writes, and that it
 * says when it has finished reading (so the root layout can hold the first paint).
 */
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppThemeProvider, useAppTheme } from './ThemeContext';
import { APPEARANCE_STORAGE_KEY } from '@/constants/appearance';
import { HAS_SEEN_WELCOME_KEY } from '@/constants/storageKeys';

function Probe({ onValue }: { onValue: (v: ReturnType<typeof useAppTheme>) => void }) {
  onValue(useAppTheme());
  return <Text>probe</Text>;
}

async function mount() {
  const seen: ReturnType<typeof useAppTheme>[] = [];
  await act(async () => {
    TestRenderer.create(
      <AppThemeProvider>
        <Probe onValue={(v) => seen.push(v)} />
      </AppThemeProvider>,
    );
  });
  return seen;
}

afterEach(async () => {
  await AsyncStorage.clear();
});

test('reports loaded=false until the stored preference has been read, then loaded=true', async () => {
  const seen = await mount();
  expect(seen[0].loaded).toBe(false);
  expect(seen[seen.length - 1].loaded).toBe(true);
});

test('brand-new install: Dark, and the choice is written down', async () => {
  const seen = await mount();
  const last = seen[seen.length - 1];
  expect(last.mode).toBe('dark');
  expect(last.scheme).toBe('dark');
  expect(await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark');
});

test('a saved Light preference is kept and never rewritten', async () => {
  await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'light');
  const last = (await mount()).slice(-1)[0];
  expect(last.mode).toBe('light');
  expect(last.scheme).toBe('light');
  expect(await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('light');
});

test('a saved System preference is kept', async () => {
  await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'system');
  expect((await mount()).slice(-1)[0].mode).toBe('system');
});

test('an install that predates the default (Welcome seen, no appearance stored) keeps following the device and writes nothing', async () => {
  await AsyncStorage.setItem(HAS_SEEN_WELCOME_KEY, 'true');
  const last = (await mount()).slice(-1)[0];
  expect(last.mode).toBe('system');
  expect(await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull();
});

test('the second launch of a new install stays Dark (the first launch persisted it)', async () => {
  await mount();
  await AsyncStorage.setItem(HAS_SEEN_WELCOME_KEY, 'true');
  expect((await mount()).slice(-1)[0].mode).toBe('dark');
});
