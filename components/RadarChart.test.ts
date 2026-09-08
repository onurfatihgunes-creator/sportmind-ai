import { angleFor, anchorFor, point, axisHasData } from './RadarChart';

// Regression coverage for making the radar generic over axis count (it used to hardcode
// 6, matching the old fixed pressing/possession "no data" axes that team-comparison.tsx
// no longer sends — see team-comparison.tsx's own comment on why they were dropped).

describe('angleFor', () => {
  it('spaces 6 axes evenly starting from the top', () => {
    const angles = [0, 1, 2, 3, 4, 5].map((i) => angleFor(i, 6));
    expect(angles[0]).toBeCloseTo(-Math.PI / 2);
    for (let i = 1; i < 6; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo((Math.PI * 2) / 6);
    }
  });

  it('spaces 4 axes evenly starting from the top', () => {
    const angles = [0, 1, 2, 3].map((i) => angleFor(i, 4));
    expect(angles[0]).toBeCloseTo(-Math.PI / 2);
    for (let i = 1; i < 4; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo((Math.PI * 2) / 4);
    }
  });
});

describe('point', () => {
  it('places axis 0 directly above the center for any axis count', () => {
    for (const count of [4, 5, 6]) {
      const p = point(0, 100, count);
      expect(p.x).toBeCloseTo(150); // CENTER.x = SIZE / 2 = 150
      expect(p.y).toBeCloseTo(40); // CENTER.y (140) - radius (100)
    }
  });
});

describe('anchorFor', () => {
  it('centers the top and bottom labels, splits the rest left/right for a 6-axis chart', () => {
    expect(anchorFor(0, 6)).toBe('middle');
    expect(anchorFor(3, 6)).toBe('middle');
    expect(anchorFor(1, 6)).toBe('start');
    expect(anchorFor(2, 6)).toBe('start');
    expect(anchorFor(4, 6)).toBe('end');
    expect(anchorFor(5, 6)).toBe('end');
  });

  it('centers the top and bottom labels, splits the rest left/right for a 4-axis chart', () => {
    expect(anchorFor(0, 4)).toBe('middle');
    expect(anchorFor(2, 4)).toBe('middle');
    expect(anchorFor(1, 4)).toBe('start');
    expect(anchorFor(3, 4)).toBe('end');
  });
});

// Regression coverage for a real bug found live: a team-comparison axis can have just
// ONE side null (one team has too little history to score, the other doesn't) — the
// original null handling was only ever exercised by axes null on BOTH sides (the old
// permanent pressing/possession axes), so it silently plotted a fabricated flat 0.5 for
// the null side right next to the other team's real number instead of marking the axis
// "no data" the same way a fully-null axis already was.
describe('axisHasData', () => {
  const axis = (a: number | null, b: number | null) => ({ key: 'k', label: 'L', a, b });

  it('is true only when both sides have a real value', () => {
    expect(axisHasData(axis(0.6, 0.4))).toBe(true);
  });

  it('is false when either side alone is null', () => {
    expect(axisHasData(axis(0.6, null))).toBe(false);
    expect(axisHasData(axis(null, 0.4))).toBe(false);
  });

  it('is false when both sides are null', () => {
    expect(axisHasData(axis(null, null))).toBe(false);
  });
});
