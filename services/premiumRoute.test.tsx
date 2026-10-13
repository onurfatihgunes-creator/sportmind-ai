/**
 * Deep link / saved URL to /premium while purchases are off must land on Home, and must not mount
 * the paywall (its purchase / restore / entitlement hooks never run).
 */
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@/constants/featureFlags', () => ({ PURCHASES_ENABLED: false }));
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
  router: { push: jest.fn(), back: jest.fn() },
}));
const mockPaywallMounted = jest.fn();
jest.mock('@/contexts/EntitlementContext', () => ({
  useEntitlement: () => {
    mockPaywallMounted();
    return { status: 'expired', trialEndsAt: null, refresh: jest.fn() };
  },
}));

import PremiumRoute from '@/app/(tabs)/premium';

it('redirects to Home and never mounts the paywall', () => {
  act(() => {
    TestRenderer.create(<PremiumRoute />);
  });
  expect(mockRedirect).toHaveBeenCalledWith('/(tabs)');
  expect(mockPaywallMounted).not.toHaveBeenCalled();
});
