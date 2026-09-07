import { useEffect } from 'react';
import { StyleSheet, type DimensionValue } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors, radius } from '@/constants/theme';

/** A pulsing placeholder shaped like the real chip/text it stands in for while data is
 * mid-fetch — never a stand-in for a guessed value, just a shape while we wait. Pulse is
 * skipped under reduced motion (renders as a static muted block instead). */
export default function SkeletonBlock({
  width,
  height = 22,
  radius: cornerRadius = radius.pill,
}: {
  width: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 0.6 : 1);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withTiming(0.45, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.block, { width, height, borderRadius: cornerRadius }, style]} />;
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.divider },
});
