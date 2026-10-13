/**
 * Regression coverage for the "cold start shows mock data indistinguishably from real" bug (no
 * screen checked DataContext's loading state, so mock content rendered for the 2-6s the first
 * fetch takes) and for the loading/error behaviour that replaced the bare spinner: while loading
 * the branded LoadingScreen stands in; a failed or timed-out load turns it into an error with
 * Retry, and "Continue offline" hands over to the existing demo-data fallback.
 */
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import DataGate from './DataGate';
import { useAppData } from '@/contexts/DataContext';

jest.mock('@/contexts/DataContext', () => ({ useAppData: jest.fn() }));
jest.mock('@/components/LoadingScreen', () => {
  const { Text: T, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ state, onRetry, onContinue }: { state: string; onRetry: () => void; onContinue: () => void }) => (
      <>
        <T>{`loading-screen:${state}`}</T>
        <Pressable testID="retry" onPress={onRetry} />
        <Pressable testID="continue" onPress={onContinue} />
      </>
    ),
  };
});

const mockUseAppData = useAppData as jest.Mock;
const retry = jest.fn();

function mount() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <DataGate>
        <Text>real screen content</Text>
      </DataGate>,
    );
  });
  return renderer;
}

function texts(r: TestRenderer.ReactTestRenderer): unknown[] {
  return r.root.findAllByType(Text).map((n) => n.props.children);
}

beforeEach(() => retry.mockClear());

test('while loading, real content never mounts and the loading screen is shown — the mock-flash bug this fixes', () => {
  mockUseAppData.mockReturnValue({ status: 'loading', loading: true, isLive: false, retry });
  expect(texts(mount())).toEqual(['loading-screen:loading']);
});

test('once the data is ready (live), the real screen mounts', () => {
  mockUseAppData.mockReturnValue({ status: 'ready', loading: false, isLive: true, retry });
  expect(texts(mount())).toEqual(['real screen content']);
});

test('a failed or timed-out load shows the error state, not the real screens and not silent demo data', () => {
  mockUseAppData.mockReturnValue({ status: 'failed', loading: false, isLive: false, retry });
  expect(texts(mount())).toEqual(['loading-screen:error']);
});

test('Retry calls the context retry and nothing else', () => {
  mockUseAppData.mockReturnValue({ status: 'failed', loading: false, isLive: false, retry });
  const r = mount();
  act(() => r.root.findByProps({ testID: 'retry' }).props.onPress());
  expect(retry).toHaveBeenCalledTimes(1);
  expect(texts(r)).toEqual(['loading-screen:error']);
});

test('"Continue offline" lets the screens mount on the existing fallback (isLive stays false)', () => {
  mockUseAppData.mockReturnValue({ status: 'failed', loading: false, isLive: false, retry });
  const r = mount();
  act(() => r.root.findByProps({ testID: 'continue' }).props.onPress());
  expect(texts(r)).toEqual(['real screen content']);
});
