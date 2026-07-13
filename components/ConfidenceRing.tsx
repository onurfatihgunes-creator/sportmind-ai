import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, confidenceColor, fonts } from '@/constants/theme';

export default function ConfidenceRing({
  value,
  size = 30,
  strokeWidth = 3,
  showLabel = true,
  labelBelow = false,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  labelBelow?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (value / 100) * circumference;
  const color = confidenceColor(value);

  const ring = (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surface}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          fill="none"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {showLabel && !labelBelow && (
        <View style={StyleSheet.absoluteFillObject}>
          <View style={styles.centerLabel}>
            <Text style={[styles.value, { fontSize: size * 0.28, color: colors.textPrimary }]}>
              {value}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  return ring;
}

const styles = StyleSheet.create({
  centerLabel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: fonts.bodySemiBold,
  },
});
