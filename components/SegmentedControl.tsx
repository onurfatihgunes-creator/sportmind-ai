import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';
import { colors, fonts, radius } from '@/constants/theme';

export type SegmentOption = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
};

type Props = {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
  height?: number;
  style?: ViewStyle;
  fontSize?: number;
};

/** A segmented control whose selection pill slides to the real measured position/width of
 * the active option (labels vary in length, so a fixed percentage can't be used) — mirrors
 * the design handoff's sport/league/tab/plan segments, which all share this exact mechanic. */
export default function SegmentedControl({ options, value, onChange, height = 38, style, fontSize = 13 }: Props) {
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const reduceMotion = useReducedMotion();

  const active = layouts[value];
  const animatedPill = useAnimatedStyle(() => {
    if (!active) return { opacity: 0 };
    const duration = reduceMotion ? 0 : 300;
    return {
      opacity: 1,
      transform: [{ translateX: withTiming(active.x, { duration }) }],
      width: withTiming(active.width, { duration }),
    };
  }, [active, reduceMotion]);

  const handleLayout = (key: string) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => (prev[key]?.x === x && prev[key]?.width === width ? prev : { ...prev, [key]: { x, width } }));
  };

  return (
    <View style={[styles.track, { height, borderRadius: height * 0.32 }, style]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.pill, { top: 4, bottom: 4, borderRadius: height * 0.24 }, animatedPill]}
      />
      {options.map((opt) => (
        <Pressable
          key={opt.key}
          onLayout={handleLayout(opt.key)}
          onPress={() => onChange(opt.key)}
          style={styles.option}
          hitSlop={4}
        >
          {opt.icon}
          <Text style={[styles.label, { fontSize, color: value === opt.key ? colors.textSecondary : colors.textSecondary }]}>
            {opt.label}
          </Text>
          {opt.badge}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.segmentTrack,
    padding: 4,
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },
  pill: {
    position: 'absolute',
    left: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    shadowColor: '#292b31',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
  },
});
