import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors, fonts } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  value: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  labelFontSize?: number;
  captionFontSize?: number;
  caption?: string;
  /** Which side of the match card (home = left, away = right) this ring's percentage
   * belongs to. The ring always drew its arc sweeping from the top toward the LEFT,
   * regardless of which team it was actually showing — confirmed live as confusing:
   * an away team's (right-card) win probability still filled leftward, disconnected
   * from where that team's own name/crest sit. Mirrored so a home (left) team's arc
   * sweeps right and an away (right) team's arc sweeps left — toward its own side.
   * Omit for a draw or when there's no side to anchor to; the sweep then keeps the
   * original, unmirrored direction. */
  favoredSide?: 'home' | 'away';
};

/** The confidence ring in the light redesign is always accent-colored (the old dark theme's
 * red/amber/green tiering was dropped) and draws in via an animated stroke-dashoffset. */
export default function ConfidenceRing({
  value,
  size = 86,
  strokeWidth = 7,
  showLabel = true,
  labelFontSize,
  captionFontSize,
  caption,
  favoredSide,
}: Props) {
  const resolvedCaptionFontSize = captionFontSize ?? Math.max(7, size * 0.075);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = circumference * (1 - value / 100);
  const progress = useSharedValue(circumference);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    progress.value = withDelay(reduceMotion ? 0 : 250, withTiming(target, { duration: reduceMotion ? 0 : 1100 }));
  }, [target, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: progress.value }));

  // The arc's own geometry always sweeps the same way (top, toward the left) — see this
  // module's own measured note below the JSX. Mirroring the whole SVG horizontally is
  // what flips that to sweep right for a home (left-card) team, since the arc itself has
  // no "direction" prop to flip. Only the SVG mirrors, never the label sibling below it,
  // so the percentage/caption text never renders backwards.
  const mirror = favoredSide === 'home';

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, mirror && styles.mirrored]}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.divider}
          strokeWidth={strokeWidth}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.primary}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          origin={`${size / 2}, ${size / 2}`}
          rotation={-90}
        />
      </Svg>
      {showLabel && (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.headline, fontSize: labelFontSize ?? size * 0.27, letterSpacing: -0.6, color: colors.textPrimary }}>
            {value}
            <Text style={{ fontSize: (labelFontSize ?? size * 0.27) * 0.5, color: colors.textFaint }}>%</Text>
          </Text>
          {caption && (
            // A long caption (e.g. Turkish "KAZANMA OLASILIĞI") could overflow past the
            // ring's stroke on the smaller sizes this component is used at (34/86) —
            // confirmed live: it spilled outside the circle at the default size. Wrapping
            // to two lines within a width that fits inside the ring, rather than forcing
            // one line, keeps the caption legible without widening the ring itself.
            <Text
              numberOfLines={2}
              style={{
                fontFamily: fonts.bodyMedium,
                fontSize: resolvedCaptionFontSize,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: colors.textFaint,
                marginTop: 4,
                textAlign: 'center',
                maxWidth: size * 0.68,
              }}
            >
              {caption}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // RN transforms originate from the element's own center by default, so scaleX: -1
  // alone mirrors this Svg around its own vertical center line — no separate translate
  // needed, unlike the raw-SVG transform string this would take inside react-native-svg.
  mirrored: { transform: [{ scaleX: -1 }] },
});
