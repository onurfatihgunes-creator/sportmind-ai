/**
 * Regression coverage for the "cold start shows mock data indistinguishably from real"
 * bug: no screen previously checked DataContext's `loading` flag, only `isLive` — which
 * stays false for the whole 2-6s the initial Supabase fetch takes, identical to the
 * false it also gets on a genuine fetch failure. DataGate is the one place that
 * distinction now gets enforced, so every screen underneath it can keep using `isLive`
 * exactly as before.
 */
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import DataGate from './DataGate';
import { useAppData } from '@/contexts/DataContext';
import type { ThemeColors } from '@/constants/theme';

jest.mock('@/contexts/DataContext', () => ({ useAppData: jest.fn() }));

const mockUseAppData = useAppData as jest.Mock;
const colors = { background: '#000000', primary: '#ffffff' } as ThemeColors;

function hasText(renderer: TestRenderer.ReactTestRenderer, text: string): boolean {
  return renderer.root.findAllByType(Text).some((node) => node.props.children === text);
}

test('while loading, real content never mounts — the mock-flash bug this fixes', () => {
  mockUseAppData.mockReturnValue({ loading: true, isLive: false });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <DataGate colors={colors}>
        <Text>real screen content</Text>
      </DataGate>,
    );
  });
  expect(hasText(renderer, 'real screen content')).toBe(false);
});

test('once loading settles (live data), the real screen mounts', () => {
  mockUseAppData.mockReturnValue({ loading: false, isLive: true });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <DataGate colors={colors}>
        <Text>real screen content</Text>
      </DataGate>,
    );
  });
  expect(hasText(renderer, 'real screen content')).toBe(true);
});

test('once loading settles (genuine fetch failure), the screen still mounts — honest mock/"Demo data" fallback is unchanged, only the transient flash is gone', () => {
  mockUseAppData.mockReturnValue({ loading: false, isLive: false });
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <DataGate colors={colors}>
        <Text>real screen content</Text>
      </DataGate>,
    );
  });
  expect(hasText(renderer, 'real screen content')).toBe(true);
});
