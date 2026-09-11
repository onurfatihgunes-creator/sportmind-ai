import { spacing } from './theme';

/**
 * Adaptive layout thresholds for wide windows — iPhone Duo's inner display first, but
 * nothing here is specific to it.
 *
 * Every number below is derived from this app's own content and its existing spacing
 * scale, never from a device model, marketing name, or a fixed Duo pixel size. That is
 * deliberate and matches Apple's own guidance for iPhone Duo: the inner display reports
 * a regular size class in BOTH axes, does not honour the app's supported interface
 * orientations, and can be narrowed further at any moment by Split View multitasking —
 * so the only durable question is "how much space do I actually have right now", which
 * is exactly what useWindowDimensions() answers. A device check would be wrong the first
 * time somebody drags the Split View divider.
 */

/**
 * Narrowest column that still reads like a normal SportMind screen: roughly the content
 * width of a small iPhone (a 320pt-wide device minus its own horizontal padding), with a
 * little headroom. Below this, match rows start wrapping team names and the confidence
 * ring crowds the text beside it.
 */
export const MIN_PANE_WIDTH = 330;

/**
 * Centre gutter between the two panes, wider than the normal 8-12pt card gap.
 *
 * On a folding device the fold runs down the middle of the open display and taps land
 * less reliably there, so the gutter is the one lever React Native has for keeping
 * content off it. It is an approximation by construction, not a claim about any
 * particular device's geometry: the reservedRegions API that reports where the fold
 * and cameras actually are is SwiftUI/UIKit-only and has no React Native binding, so
 * this code never pretends to know the real hinge coordinates.
 */
export const PANE_GUTTER = 28;

/**
 * Content width at which two panes stop being cramped: two minimum panes, the gutter
 * between them, and the screen's existing horizontal padding on both sides.
 */
export const DUAL_PANE_MIN_WIDTH = MIN_PANE_WIDTH * 2 + PANE_GUTTER + spacing.screenX * 2;

/** Width of the vertical navigation rail the bottom tab bar becomes on a wide window. */
export const NAV_RAIL_WIDTH = 88;

/**
 * Window width at which the app switches to its wide composition. The rail and the
 * two-pane layout flip at the same moment on purpose: if the rail appeared first it
 * would take its 88pt out of the very space the panes are being measured against, and
 * there would be an in-between band where the navigation had already moved but the
 * content had not gained anything for it.
 */
export const WIDE_MIN_WIDTH = DUAL_PANE_MIN_WIDTH + NAV_RAIL_WIDTH;

/**
 * A single column of prose, settings rows or a paywall stops being comfortable to read
 * long before it stops fitting — these screens are centred and capped on a wide window
 * rather than split, because there is no second thing to put beside them and padding
 * out real content with invented content is not an option.
 */
export const MAX_SINGLE_COLUMN_WIDTH = 560;

export type PaneCount = 'single' | 'dual';

export type AdaptiveLayout = {
  /** True once the window is wide enough for the two-pane composition. */
  wide: boolean;
  navigation: 'bottomBar' | 'sideRail';
  /** 0 while the tab bar is at the bottom; NAV_RAIL_WIDTH once it is a side rail. */
  railWidth: number;
  /** Window width minus whatever the navigation rail has taken. */
  contentWidth: number;
  panes: PaneCount;
  gutter: number;
  maxSingleColumnWidth: number;
};

export function resolveAdaptiveLayout(windowWidth: number): AdaptiveLayout {
  const wide = windowWidth >= WIDE_MIN_WIDTH;
  const railWidth = wide ? NAV_RAIL_WIDTH : 0;
  return {
    wide,
    navigation: wide ? 'sideRail' : 'bottomBar',
    railWidth,
    contentWidth: windowWidth - railWidth,
    panes: wide ? 'dual' : 'single',
    gutter: PANE_GUTTER,
    maxSingleColumnWidth: MAX_SINGLE_COLUMN_WIDTH,
  };
}

/**
 * The same question asked about a region that is not the whole window — Match Analysis
 * renders both as a full route and inside Explore's detail pane, and inside that pane it
 * has roughly half the width, so it must decide its own internal columns from the space
 * it was actually handed rather than from the window. Never assumes a rail: a nested
 * region has already had the rail subtracted by whoever is laying it out.
 */
export function panesForWidth(availableWidth: number): PaneCount {
  return availableWidth >= DUAL_PANE_MIN_WIDTH ? 'dual' : 'single';
}
