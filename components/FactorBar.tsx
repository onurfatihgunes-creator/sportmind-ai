import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { colors, fonts } from '@/constants/theme';

type Props = {
  label: string;
  homePct: number;
  awayPct: number;
  homeName: string;
  awayName: string;
  qualifier: string;
  highlighted?: boolean;
  delay?: number;
};

/** A single labeled head-to-head bar used in Match Analysis' "Nedenler" tab — replaces the
 * old FactorCompareBar, matching the redesign's bar + two-side-percentage layout. */
export default function FactorBar({ label, homePct, awayPct, homeName, awayName, qualifier, highlighted, delay = 0 }: Props) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    scale.value = withDelay(reduceMotion ? 0 : delay, withTiming(1, { duration: reduceMotion ? 0 : 750 }));
  }, [reduceMotion, delay]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));

  return (
    <View>
      <View style={styles.top}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.qualifier, highlighted && { fontFamily: fonts.bodySemiBold, color: colors.primaryText }]}>{qualifier}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: `${homePct}%`, transformOrigin: 'left' }, style]} />
      </View>
      <View style={styles.bottom}>
        <Text style={styles.side}>
          <Text style={styles.sideStrong}>{homePct}%</Text> {homeName}
        </Text>
        <Text style={styles.side}>
          <Text style={styles.sideStrong}>{awayPct}%</Text> {awayName}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  qualifier: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  track: { height: 9, borderRadius: 5, backgroundColor: colors.divider, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 5 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  side: { fontFamily: fonts.body, fontSize: 11, color: colors.textTertiaryAlt },
  sideStrong: { fontFamily: fonts.bodyBold, color: colors.textPrimary },
});
