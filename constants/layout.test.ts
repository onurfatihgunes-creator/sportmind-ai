import {
  DUAL_PANE_MIN_WIDTH,
  MAX_SINGLE_COLUMN_WIDTH,
  MIN_PANE_WIDTH,
  NAV_RAIL_WIDTH,
  PANE_GUTTER,
  WIDE_MIN_WIDTH,
  panesForWidth,
  resolveAdaptiveLayout,
} from './layout';
import { spacing } from './theme';

describe('adaptive layout thresholds', () => {
  it('derives the dual-pane threshold from content, not from a device size', () => {
    expect(DUAL_PANE_MIN_WIDTH).toBe(MIN_PANE_WIDTH * 2 + PANE_GUTTER + spacing.screenX * 2);
  });

  it('flips the rail and the panes at the same width, so the rail never eats the space the panes were measured against', () => {
    expect(WIDE_MIN_WIDTH).toBe(DUAL_PANE_MIN_WIDTH + NAV_RAIL_WIDTH);
    const atThreshold = resolveAdaptiveLayout(WIDE_MIN_WIDTH);
    expect(atThreshold.navigation).toBe('sideRail');
    expect(atThreshold.panes).toBe('dual');
    // The whole point of tying the two together: once the rail has taken its width,
    // what is left is still enough for two real panes.
    expect(atThreshold.contentWidth).toBeGreaterThanOrEqual(DUAL_PANE_MIN_WIDTH);
  });
});

describe('resolveAdaptiveLayout', () => {
  // Every current iPhone portrait width, and then some — none of these may ever go wide.
  it.each([320, 375, 390, 393, 402, 430, 440])('stays single-column and bottom-bar at %ipt', (width) => {
    const layout = resolveAdaptiveLayout(width);
    expect(layout.wide).toBe(false);
    expect(layout.panes).toBe('single');
    expect(layout.navigation).toBe('bottomBar');
    expect(layout.railWidth).toBe(0);
    expect(layout.contentWidth).toBe(width);
  });

  it('goes wide on a window big enough for two panes plus the rail', () => {
    const layout = resolveAdaptiveLayout(WIDE_MIN_WIDTH + 200);
    expect(layout.wide).toBe(true);
    expect(layout.panes).toBe('dual');
    expect(layout.navigation).toBe('sideRail');
    expect(layout.railWidth).toBe(NAV_RAIL_WIDTH);
    expect(layout.contentWidth).toBe(WIDE_MIN_WIDTH + 200 - NAV_RAIL_WIDTH);
  });

  it('falls back to the phone composition one point below the threshold', () => {
    expect(resolveAdaptiveLayout(WIDE_MIN_WIDTH - 1).wide).toBe(false);
    expect(resolveAdaptiveLayout(WIDE_MIN_WIDTH).wide).toBe(true);
  });

  it('is a pure function of width — the same width always resolves the same way', () => {
    expect(resolveAdaptiveLayout(900)).toEqual(resolveAdaptiveLayout(900));
  });

  it('exposes the gutter and single-column cap so screens never re-derive them', () => {
    const layout = resolveAdaptiveLayout(900);
    expect(layout.gutter).toBe(PANE_GUTTER);
    expect(layout.maxSingleColumnWidth).toBe(MAX_SINGLE_COLUMN_WIDTH);
  });
});

describe('panesForWidth', () => {
  it('asks only about the region it was given, with no rail subtracted', () => {
    expect(panesForWidth(DUAL_PANE_MIN_WIDTH)).toBe('dual');
    expect(panesForWidth(DUAL_PANE_MIN_WIDTH - 1)).toBe('single');
  });

  it('keeps Match Analysis single-column inside a detail pane that is itself half a wide window', () => {
    // Explore hands its detail pane a little over half the content width. Even on a very
    // large window that pane is narrower than the dual threshold, so the embedded
    // analysis must not try to split again inside it.
    const wide = resolveAdaptiveLayout(WIDE_MIN_WIDTH);
    const detailPaneWidth = (wide.contentWidth - PANE_GUTTER) * 0.55;
    expect(panesForWidth(detailPaneWidth)).toBe('single');
  });
});
