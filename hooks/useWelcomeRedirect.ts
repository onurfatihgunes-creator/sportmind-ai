import { useEffect, useRef } from 'react';

/**
 * Navigates away exactly once, the first time `ready` is true and
 * `hasSeenWelcome` is false — deferred one frame past the render that made
 * it true, via `requestAnimationFrame` rather than calling `navigate`
 * synchronously inside the effect.
 *
 * WHY THE DEFER MATTERS: `ready` becoming true for the first time is also
 * the very first render where app/_layout.tsx's <Stack> exists at all (it
 * returns null before that). Calling the navigation directly in the same
 * effect that commits that first Stack mount sent expo-router's web
 * navigation container into an infinite remount loop, live-confirmed
 * 2026-09-30: the navigate call tore the whole root layout down before it
 * finished mounting, which reset its state back to not-ready, which re-ran
 * this same effect once the async setup (fonts/i18n/storage) finished
 * again, which navigated again — thousands of times a second, with every
 * screen (and its data fetch) perpetually torn down before it could ever
 * render. This is what the user's "opens but freezes, no data" report was.
 * A plain `useRef` guard alone did not fix it, because the whole component
 * — including its refs — was being remounted, not just re-rendered.
 *
 * This hook only proves the "exactly once, deferred" contract in isolation
 * (see useWelcomeRedirect.test.ts) — it cannot reproduce the remount
 * cascade itself, which is a real browser/expo-router-web phenomenon, not
 * something jsdom's test renderer exercises.
 */
export function useWelcomeRedirect(ready: boolean, hasSeenWelcome: boolean | null, navigate: () => void) {
  const hasNavigated = useRef(false);
  useEffect(() => {
    if (ready && hasSeenWelcome === false && !hasNavigated.current) {
      hasNavigated.current = true;
      requestAnimationFrame(navigate);
    }
  }, [ready, hasSeenWelcome, navigate]);
}
