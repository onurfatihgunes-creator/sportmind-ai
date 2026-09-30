/**
 * Regression coverage for the 2026-09-30 infinite-remount/frozen-screen bug:
 * app/_layout.tsx used to call router.replace('/welcome') synchronously,
 * inside the same effect that first mounted <Stack>, with only a useRef
 * guard against calling it twice. Live-confirmed in the web preview that
 * this sent expo-router's web navigation container into a remount loop —
 * thousands of calls a second, no screen ever finishing a render. This
 * hook fixes it by deferring the navigate past the mounting commit (see its
 * own header comment for why). What this test can and cannot prove: it
 * proves the "exactly once, deferred past the commit" contract holds even
 * across repeated effect re-runs — it cannot reproduce the actual
 * expo-router-web remount cascade itself, which only a real browser (or
 * device) exercises.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useWelcomeRedirect } from './useWelcomeRedirect';

function Harness({
  ready,
  hasSeenWelcome,
  navigate,
}: {
  ready: boolean;
  hasSeenWelcome: boolean | null;
  navigate: () => void;
}) {
  useWelcomeRedirect(ready, hasSeenWelcome, navigate);
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('never navigates before ready, or while hasSeenWelcome is still unknown (null)', () => {
  const navigate = jest.fn();
  act(() => {
    create(<Harness ready={false} hasSeenWelcome={null} navigate={navigate} />);
    jest.runAllTimers();
  });
  expect(navigate).not.toHaveBeenCalled();
});

test('does not navigate at all once hasSeenWelcome is true', () => {
  const navigate = jest.fn();
  act(() => {
    create(<Harness ready={true} hasSeenWelcome={true} navigate={navigate} />);
    jest.runAllTimers();
  });
  expect(navigate).not.toHaveBeenCalled();
});

test('navigates once ready — but deferred past the render that made it true, never synchronously inside the effect', () => {
  const navigate = jest.fn();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Harness ready={false} hasSeenWelcome={null} navigate={navigate} />);
  });

  act(() => {
    renderer.update(<Harness ready={true} hasSeenWelcome={false} navigate={navigate} />);
  });
  // The exact bug: calling navigate synchronously here, in the same commit
  // that first made `ready` true, is what fed the remount loop.
  expect(navigate).not.toHaveBeenCalled();

  act(() => {
    jest.runAllTimers();
  });
  expect(navigate).toHaveBeenCalledTimes(1);
});

test('never navigates a second time, even if the effect re-runs with ready/hasSeenWelcome unchanged', () => {
  const navigate = jest.fn();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Harness ready={true} hasSeenWelcome={false} navigate={navigate} />);
  });
  act(() => {
    jest.runAllTimers();
  });
  expect(navigate).toHaveBeenCalledTimes(1);

  // Simulates the exact shape of the original bug: the owning component
  // (app/_layout.tsx's RootLayoutInner) re-rendering/re-running this effect
  // again with the same ready/hasSeenWelcome values — this must never fire
  // navigate a second time from the SAME hook instance.
  act(() => {
    renderer.update(<Harness ready={true} hasSeenWelcome={false} navigate={navigate} />);
    jest.runAllTimers();
  });
  expect(navigate).toHaveBeenCalledTimes(1);
});
