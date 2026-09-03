import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors, fonts } from '@/constants/theme';

type Segment = { pct: number; color: string; textColor: string };

function Bar({ segment, delay }: { segment: Segment; delay: number }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    scale.value = withDelay(reduceMotion ? 0 : delay, withTiming(1, { duration: reduceMotion ? 0 : 800 }));
  }, [reduceMotion, delay]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));

  if (segment.pct <= 0) return null;
  return (
    <Animated.View style={[styles.segment, { flex: segment.pct, backgroundColor: segment.color, transformOrigin: 'left' }, style]}>
      <Text style={[styles.segmentText, { color: segment.textColor }]}>{segment.pct}</Text>
    </Animated.View>
  );
}

/** The 3-part outcome-distribution bar on Home's hero card and Match Analysis. `draw` can
 * be 0 to render a 2-segment (basketball) bar. */
export default function StackedDistributionBar({ home, draw, away, height = 34 }: { home: number; draw: number; away: number; height?: number }) {
  return (
    <View style={[styles.row, { height }]}>
      <Bar segment={{ pct: home, color: colors.primary, textColor: colors.primaryTint }} delay={300} />
      {draw > 0 && <Bar segment={{ pct: draw, color: colors.neutralSeriesLight, textColor: colors.textSecondary }} delay={400} />}
      <Bar segment={{ pct: away, color: colors.neutralSeries, textColor: colors.surface }} delay={500} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, borderRadius: 10, overflow: 'hidden' },
  segment: { alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
});
