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

  const homeStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));
  const awayStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));

  return (
    <View>
      <View style={styles.top}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.qualifier, highlighted && { fontFamily: fonts.bodySemiBold, color: colors.primaryText }]}>{qualifier}</Text>
      </View>
      {/* Two real segments, not one fill over a neutral track — the away side previously
          rendered as bare, undifferentiated track background (same color regardless of its
          own real percentage), reading as "no data for the away team" or "broken chart"
          rather than the genuine awayPct it always was (homePct + awayPct already sum to
          100 — this is a rendering fix, not a new calculation). */}
      <View style={styles.track}>
        <Animated.View style={[styles.fillHome, { width: `${homePct}%`, transformOrigin: 'left' }, homeStyle]} />
        <Animated.View style={[styles.fillAway, { width: `${awayPct}%`, transformOrigin: 'right' }, awayStyle]} />
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
  track: { flexDirection: 'row', height: 9, borderRadius: 5, overflow: 'hidden' },
  // A thick seam (not just a color change) between the two segments — confirmed live
  // that the plain purple→slate boundary alone read as too subtle to register as "two
  // distinct values" at a glance. Rendered as a right border on the home segment (border-
  // box sizing keeps its own `width: homePct%` exact — this eats 3px INTO the purple
  // fill right at its own edge, it's not an extra sibling that would push awayPct's
  // segment wider than the track and overflow it) in the card's own surface color, so it
  // reads as a genuine gap/cut rather than a random third color.
  fillHome: { height: '100%', backgroundColor: colors.primary, borderRightWidth: 3, borderRightColor: colors.surface },
  fillAway: { height: '100%', backgroundColor: colors.neutralSeries },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  side: { fontFamily: fonts.body, fontSize: 11, color: colors.textTertiaryAlt },
  sideStrong: { fontFamily: fonts.bodyBold, color: colors.textPrimary },
});
