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

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
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
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fonts.bodyMedium,
                fontSize: resolvedCaptionFontSize,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: colors.textFaint,
                marginTop: 4,
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
