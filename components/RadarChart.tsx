import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors } from '@/constants/theme';

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

export type RadarAxis = { key: string; label: string; a: number | null; b: number | null };

const SIZE = 300;
const CENTER = { x: SIZE / 2, y: 140 };
const MAX_R = 100;

function angleFor(i: number) {
  return -Math.PI / 2 + i * ((Math.PI * 2) / 6);
}

function point(i: number, r: number) {
  const a = angleFor(i);
  return { x: CENTER.x + r * Math.cos(a), y: CENTER.y + r * Math.sin(a) };
}

function polygonAt(r: number) {
  return Array.from({ length: 6 }, (_, i) => point(i, r))
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

function anchorFor(i: number): 'start' | 'middle' | 'end' {
  if (i === 0 || i === 3) return 'middle';
  return i === 1 || i === 2 ? 'start' : 'end';
}

function Series({ axes, pick, color, dashed, delay }: { axes: RadarAxis[]; pick: (a: RadarAxis) => number | null; color: string; dashed?: boolean; delay: number }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    opacity.value = withDelay(reduceMotion ? 0 : delay, withTiming(1, { duration: reduceMotion ? 0 : 700 }));
  }, [reduceMotion, delay]);

  const animatedProps = useAnimatedProps(() => ({ opacity: opacity.value }));

  const points = axes.map((axis, i) => point(i, MAX_R * (pick(axis) ?? 0.5))).map((p) => `${p.x},${p.y}`).join(' ');

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

/** 6-axis radar comparing two teams. Axes with no computable data (see plan: pressing and
 * possession aren't available on the free data tier) pass `a: null, b: null` and render at
 * a flat neutral value with a muted "veri yok" label suffix instead of fabricated numbers. */
export default function RadarChart({ axes, colorA = colors.primary, colorB = colors.neutralSeries }: { axes: RadarAxis[]; colorA?: string; colorB?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={SIZE} height={280} viewBox={`0 0 ${SIZE} 250`}>
        <Polygon points={polygonAt(MAX_R)} fill="none" stroke={colors.divider} strokeWidth={1} />
        <Polygon points={polygonAt((MAX_R * 2) / 3)} fill="none" stroke={colors.divider} strokeWidth={1} />
        <Polygon points={polygonAt(MAX_R / 3)} fill="none" stroke={colors.divider} strokeWidth={1} />
        {axes.map((_, i) => {
          const p = point(i, MAX_R);
          return <Line key={i} x1={CENTER.x} y1={CENTER.y} x2={p.x} y2={p.y} stroke={colors.border} strokeWidth={1} />;
        })}
        <Series axes={axes} pick={(a) => a.a} color={colorA} delay={200} />
        <Series axes={axes} pick={(a) => a.b} color={colorB} dashed delay={350} />
        {axes.map((axis, i) => {
          const p = point(i, MAX_R + 24);
          const noData = axis.a === null;
          return (
            <SvgText
              key={axis.key}
              x={p.x}
              y={p.y}
              textAnchor={anchorFor(i)}
              fontFamily="Inter_500Medium"
              fontSize={11}
              fill={noData ? colors.textFainter : colors.textTertiaryAlt}
            >
              {axis.label}
              {noData ? ' · veri yok' : ''}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}
