import type { ReactNode } from 'react';
import WelcomeScreen from '@/components/WelcomeScreen';

/**
 * First launch shows Welcome and nothing else: `children` (DataGate → the Stack, i.e. Home) are
 * not mounted at all until Welcome has been finished, so Home can never flash underneath it.
 * This replaces the old "mount the Stack, then router.replace('/welcome')" redirect, which
 * rendered Home first and was also the source of the remount loop (see hooks history).
 * Welcome does not wait for Home's data either — the providers above keep loading it, so by the
 * time "Get started" is tapped Home is usually ready.
 */
export default function OnboardingGate({
  hasSeenWelcome,
  onFinishWelcome,
  children,
}: {
  hasSeenWelcome: boolean;
  onFinishWelcome: () => void | Promise<void>;
  children: ReactNode;
}) {
  if (!hasSeenWelcome) return <WelcomeScreen onFinish={onFinishWelcome} />;
  return <>{children}</>;
}
