import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { fonts, type ThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/contexts/ThemeContext';

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
        <Text style={styles.label} maxFontSizeMultiplier={1.3}>{label}</Text>
        <Text maxFontSizeMultiplier={1.3} style={[styles.qualifier, highlighted && { fontFamily: fonts.bodySemiBold, color: colors.primaryText }]}>{qualifier}</Text>
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
        <Text style={styles.side} maxFontSizeMultiplier={1.3}>
          <Text style={styles.sideStrong}>{homePct}%</Text> {homeName}
        </Text>
        <Text style={[styles.side, styles.sideEnd]} maxFontSizeMultiplier={1.3}>
          <Text style={styles.sideStrong}>{awayPct}%</Text> {awayName}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  // Both texts may shrink and wrap (minWidth 0 + flexShrink): a long factor name plus a long
  // "favours <club>" qualifier used to be one non-wrapping row wider than the card.
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  label: { flexShrink: 1, minWidth: 0, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  qualifier: { flexShrink: 1, minWidth: 0, textAlign: 'right', fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.textFaint },
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
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginTop: 5 },
  side: { flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 11, color: colors.textTertiaryAlt },
  sideEnd: { textAlign: 'right' },
  sideStrong: { fontFamily: fonts.bodyBold, color: colors.textPrimary },
});
