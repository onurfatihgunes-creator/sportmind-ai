import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { colors } from '@/constants/theme';

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

export type RadarAxis = { key: string; label: string; a: number | null; b: number | null };

const SIZE = 300;
const CENTER = { x: SIZE / 2, y: 140 };
const MAX_R = 100;

// Exported for unit testing only (see RadarChart.test.ts) — the component itself only
// ever calls these internally.
export function angleFor(i: number, count: number) {
  return -Math.PI / 2 + i * ((Math.PI * 2) / count);
}

export function point(i: number, r: number, count: number) {
  const a = angleFor(i, count);
  return { x: CENTER.x + r * Math.cos(a), y: CENTER.y + r * Math.sin(a) };
}

function polygonAt(r: number, count: number) {
  return Array.from({ length: count }, (_, i) => point(i, r, count))
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

// Anchor assumes an even axis count arranged symmetrically (true for both the
// original 6 and the 4-axis case below) — top/bottom labels center, the rest
// split left/right down the middle.
export function anchorFor(i: number, count: number): 'start' | 'middle' | 'end' {
  if (i === 0 || i === count / 2) return 'middle';
  return i < count / 2 ? 'start' : 'end';
}

// An axis counts as having data only when BOTH sides do. A caller can send an axis
// where just one team's value is null (e.g. one team has too little real history to
// score — see team-comparison.tsx's dataConfidence-gated formScore) — plotting the real
// side's number next to a fabricated flat point for the other would present a genuine
// value and a guess as if they were equally meaningful. Same treatment as a fully-null
// axis (both fall back to the neutral flat vertex), just triggered by either side.
// Exported for unit testing only, same as angleFor/point/anchorFor above.
export function axisHasData(axis: RadarAxis): boolean {
  return axis.a !== null && axis.b !== null;
}

function Series({ axes, pick, color, dashed, delay }: { axes: RadarAxis[]; pick: (a: RadarAxis) => number | null; color: string; dashed?: boolean; delay: number }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    opacity.value = withDelay(reduceMotion ? 0 : delay, withTiming(1, { duration: reduceMotion ? 0 : 700 }));
  }, [reduceMotion, delay]);

  const animatedProps = useAnimatedProps(() => ({ opacity: opacity.value }));

  const points = axes.map((axis, i) => point(i, MAX_R * (axisHasData(axis) ? pick(axis)! : 0.5), axes.length)).map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <AnimatedPolygon
      points={points}
      fill={`${color}29`}
      stroke={color}
      strokeWidth={2}
      strokeDasharray={dashed ? '4 3' : undefined}
      animatedProps={animatedProps}
    />
  );
}

/** Radar comparing two teams on whatever axes the caller passes — not fixed at 6. Either
 * side of an axis may be `null` (genuinely uncomputable for that team — e.g. too little
 * real match history, see team-comparison.tsx's dataConfidence-gated scores), and the two
 * sides don't have to be null together: a null on just one side still renders the whole
 * axis at a flat neutral value with a muted "no data" label (see axisHasData) rather than
 * plotting one team's real number next to a fabricated point for the other. */
// Extra horizontal canvas on each side, beyond the chart itself, for axis labels that
// land at (or near) a pure left/right position with text-anchor 'start'/'end' — at 4
// axes "Home form"/"Home advantage"-length labels sit exactly horizontal and clipped
// against the old bounds (found live: "Home form" rendered as just "form"). At 6 axes
// those positions were diagonal and had a little more natural room, but the margin
// helps there too rather than hurting it.
//
// KNOWN REMAINING ISSUE (found live, Intelligence 8.0's mobile-worktree audit,
// 2026-09-08): a "no data" axis appends `teamComparison.noDataSuffix` to the label (e.g.
// "Home form · No data"), long enough to still clip on a real zero-form case (Feyenoord
// Rotterdam, team-comparison?a=81&b=675) even with this margin. Simply growing
// LABEL_MARGIN does NOT fix it — this SVG's rendered `width` (SIZE + LABEL_MARGIN * 2)
// already exceeds the ~343px available width inside radarCard's padding on a real
// mobile viewport, so a bigger margin only pushes MORE of the SVG off the visible
// viewport on both sides equally; the clipping is a container-width overflow, not a
// viewBox-coordinate shortage. A real fix needs the SVG's rendered width capped to the
// card's actual available width (with the viewBox providing the extra virtual space at
// a proportionally smaller render scale, or the "no data" suffix moved to a second,
// stacked line) — deliberately NOT attempted here without proper on-device measurement.
const LABEL_MARGIN = 46;

export default function RadarChart({ axes, colorA = colors.primary, colorB = colors.neutralSeries }: { axes: RadarAxis[]; colorA?: string; colorB?: string }) {
  const { t } = useTranslation();
  const count = axes.length;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={SIZE + LABEL_MARGIN * 2} height={280} viewBox={`${-LABEL_MARGIN} 0 ${SIZE + LABEL_MARGIN * 2} 250`}>
        <Polygon points={polygonAt(MAX_R, count)} fill="none" stroke={colors.divider} strokeWidth={1} />
        <Polygon points={polygonAt((MAX_R * 2) / 3, count)} fill="none" stroke={colors.divider} strokeWidth={1} />
        <Polygon points={polygonAt(MAX_R / 3, count)} fill="none" stroke={colors.divider} strokeWidth={1} />
        {axes.map((_, i) => {
          const p = point(i, MAX_R, count);
          return <Line key={i} x1={CENTER.x} y1={CENTER.y} x2={p.x} y2={p.y} stroke={colors.border} strokeWidth={1} />;
        })}
        <Series axes={axes} pick={(a) => a.a} color={colorA} delay={200} />
        <Series axes={axes} pick={(a) => a.b} color={colorB} dashed delay={350} />
        {axes.map((axis, i) => {
          const p = point(i, MAX_R + 24, count);
          const noData = !axisHasData(axis);
          return (
            <SvgText
              key={axis.key}
              x={p.x}
              y={p.y}
              textAnchor={anchorFor(i, count)}
              fontFamily="Inter_500Medium"
              fontSize={11}
              fill={noData ? colors.textFainter : colors.textTertiaryAlt}
            >
              {axis.label}
              {noData ? t('teamComparison.noDataSuffix') : ''}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}
