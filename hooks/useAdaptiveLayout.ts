import { useMemo } from 'react';
import { I18nManager, Platform, useWindowDimensions, type ViewStyle } from 'react-native';
import { resolveAdaptiveLayout, type AdaptiveLayout } from '@/constants/layout';

/**
 * The single place the app asks "how much room do I have". Deliberately built on
 * useWindowDimensions rather than a device check or a screen-size constant — on iPhone
 * Duo the window changes size when the device is unfolded, rotated, or resized by Split
 * View, and this hook re-renders for all three without knowing which one happened.
 */
export function useAdaptiveLayout(): AdaptiveLayout {
  const { width } = useWindowDimensions();
  return useMemo(() => resolveAdaptiveLayout(width), [width]);
}

/**
 * Centre-and-cap style for the screens that genuinely have nothing to put in a second
 * column (settings, legal text, the paywall). Returns undefined on a phone so those
 * screens keep byte-for-byte their current layout.
 */
export function singleColumnStyle(layout: AdaptiveLayout): ViewStyle | undefined {
  if (!layout.wide) return undefined;
  return { width: '100%', maxWidth: layout.maxSingleColumnWidth, alignSelf: 'center' };
}

/**
 * Which side is the leading one, for the few places that have to position something
 * against an edge rather than let flexbox mirror it.
 *
 * Both halves are load-bearing. On a native RTL build I18nManager is the truth, and the
 * app forces it at boot. On web it is not: react-native-web does not drive the browser's
 * bidi direction from I18nManager (i18n/index.ts already documents this and sets
 * document.dir itself), and it resolves logical style props like insetInlineStart to a
 * physical left/right when the stylesheet is compiled — verified here, not assumed — so a
 * logical inset alone silently pins the rail to the left in Arabic.
 */
export function isRTLLayout(): boolean {
  if (I18nManager.isRTL) return true;
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return document.documentElement.dir === 'rtl';
  }
  return false;
}

/**
 * Space a scrolling screen must leave for the navigation rail — on whichever side the
 * rail is actually on. Resolved through isRTLLayout for the same reason the rail's own
 * position is: react-native-web flattens logical padding to a physical side at compile
 * time, so paddingStart alone would leave the gap on the wrong side in Arabic.
 */
export function railInsetStyle(layout: AdaptiveLayout): ViewStyle | undefined {
  if (layout.railWidth === 0) return undefined;
  return isRTLLayout() ? { paddingRight: layout.railWidth } : { paddingLeft: layout.railWidth };
}

