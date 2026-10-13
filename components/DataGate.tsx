import { useState, type ReactNode } from 'react';
import LoadingScreen from '@/components/LoadingScreen';
import { useAppData } from '@/contexts/DataContext';

/**
 * Blocks every real screen from mounting until DataContext's own initial fetch has
 * settled — root fix for mock fixtures rendering indistinguishably from real ones for the
 * 2-6s that fetch takes (confirmed live: no screen previously checked `loading`, only
 * `isLive`, so mock content and a real NotFoundState for a real deep-linked id/match could
 * both render before the real answer arrived). No screen underneath ever sees `loading: true`,
 * so none of them need their own copy of this check.
 *
 * While the fetch is in flight the branded LoadingScreen stands in (indeterminate — nothing
 * here knows a percentage). If the load fails, comes back empty or times out, the same screen
 * turns into a plain error with Retry, and "Continue offline" lets the person on with exactly
 * what the app already had for that case: DataContext.isLive stays false and Home's existing
 * "Demo data" / empty states apply. A late answer still upgrades the data underneath.
 */
export default function DataGate({ children }: { children: ReactNode }) {
  const { status, retry } = useAppData();
  const [continued, setContinued] = useState(false);

  if (status === 'ready' || continued) return <>{children}</>;
  return <LoadingScreen state={status === 'failed' ? 'error' : 'loading'} onRetry={retry} onContinue={() => setContinued(true)} />;
}
