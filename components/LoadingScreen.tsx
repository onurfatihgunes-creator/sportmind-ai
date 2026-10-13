import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import { fonts, radius, type ThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/contexts/ThemeContext';
import { isRTLLayout } from '@/hooks/useAdaptiveLayout';

/** The same artwork the native splash shows, drawn at about the size Android's splash draws
 *  it, so the hand-off from native splash to this screen reads as one continuous moment. */
const LOGO_SIZE = 136;
const RING_MAX_SCALE = 1.9;
const RING_DURATION_MS = 2400;
const BAR_WIDTH = 220;
const BAR_SEGMENT = 88;
const BAR_DURATION_MS = 1400;

/** After this long still loading, the status line says so — a hint about the real wait, not a
 *  progress figure. */
export const SLOW_HINT_AFTER_MS = 6000;

export type LoadingState = 'loading' | 'error';

type Props = {
  state: LoadingState;
  onRetry: () => void;
  onContinue: () => void;
};

/** One expanding, fading ring: a quiet "signal being read" pulse behind the logo. Transform and
 *  opacity only, so it runs on the UI thread and stays cheap on low-end Android. */
function PulseRing({ delayMs, color, animate }: { delayMs: number; color: string; animate: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!animate) {
      progress.value = 0;
      return;
    }
    progress.value = withDelay(
      delayMs,
      withRepeat(withTiming(1, { duration: RING_DURATION_MS, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, [animate, delayMs]);

  const style = useAnimatedStyle(() => ({
    opacity: animate ? 0.38 * (1 - progress.value) : 0,
    transform: [{ scale: 1 + (RING_MAX_SCALE - 1) * progress.value }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: color }, style]} />;
}

/** Indeterminate on purpose: nothing here knows how far along the fetch is, and a made-up
 *  percentage would be a lie. A segment sweeps along the track in the reading direction. */
function IndeterminateBar({ colors, animate, label }: { colors: ThemeColors; animate: boolean; label: string }) {
  const progress = useSharedValue(0);
  const direction = isRTLLayout() ? -1 : 1;

  useEffect(() => {
    if (!animate) return;
    progress.value = withRepeat(withTiming(1, { duration: BAR_DURATION_MS, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [animate]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: direction * (animate ? -BAR_SEGMENT + (BAR_WIDTH + BAR_SEGMENT) * progress.value : (BAR_WIDTH - BAR_SEGMENT) / 2) }],
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[styles.track, { backgroundColor: colors.border }]}
    >
      <Animated.View style={[styles.segment, { backgroundColor: colors.primary }, style]} />
    </View>
  );
}

/** A faint half-pitch drawn behind the logo — centre circle and halfway line — as a static
 *  backdrop for the analysis feel. Static SVG, so it costs nothing per frame. */
function PitchBackdrop({ color }: { color: string }) {
  const size = 320;
  const mid = size / 2;
  return (
    <Svg width={size} height={size} style={styles.pitch} pointerEvents="none">
      <Line x1={0} y1={mid} x2={size} y2={mid} stroke={color} strokeWidth={1} opacity={0.18} />
      <Circle cx={mid} cy={mid} r={mid - 8} stroke={color} strokeWidth={1} fill="none" opacity={0.14} />
      <Circle cx={mid} cy={mid} r={mid * 0.62} stroke={color} strokeWidth={1} fill="none" opacity={0.1} />
    </Svg>
  );
}

/**
 * The screen between the native splash and the first real screen, shown for exactly as long as
 * something real is still loading (see DataGate) — there is no minimum display time.
 *
 * It does not show a percentage: the loader cannot know one. The bar is indeterminate and the
 * line under it names the real stage. If the load fails or times out it says so plainly and
 * offers Retry, or to continue with what the app already has offline (Home's "Demo data").
 */
export default function LoadingScreen({ state, onRetry, onContinue }: Props) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const animate = !reducedMotion;
  const [slow, setSlow] = useState(false);
  const themed = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    setSlow(false);
    if (state !== 'loading') return;
    const id = setTimeout(() => setSlow(true), SLOW_HINT_AFTER_MS);
    return () => clearTimeout(id);
  }, [state]);

  const status = slow ? t('loading.statusSlow') : t('loading.statusAnalyses');

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEnabled={state === 'error'}
        >
          <View style={styles.hero}>
            <View style={styles.logoStage}>
              <PitchBackdrop color={colors.primary} />
              <PulseRing delayMs={0} color={colors.primary} animate={animate && state === 'loading'} />
              <PulseRing delayMs={RING_DURATION_MS / 2} color={colors.primary} animate={animate && state === 'loading'} />
              <Image
                source={require('../assets/images/splash-icon.png')}
                style={styles.logo}
                accessibilityIgnoresInvertColors
              />
            </View>
            <Text style={themed.brand} maxFontSizeMultiplier={1.3} accessibilityRole="header">
              SportMind <Text style={themed.brandAccent}>AI</Text>
            </Text>
          </View>

          <View style={styles.footer}>
            {state === 'loading' ? (
              <>
                <IndeterminateBar colors={colors} animate={animate} label={status} />
                <Text style={themed.status} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
                  {status}
                </Text>
              </>
            ) : (
              <View style={styles.errorBlock} accessibilityLiveRegion="polite">
                <Text style={themed.errorTitle} maxFontSizeMultiplier={1.3}>
                  {t('loading.errorTitle')}
                </Text>
                <Text style={themed.errorBody} maxFontSizeMultiplier={1.3}>
                  {t('loading.errorBody')}
                </Text>
                <Pressable
                  onPress={onRetry}
                  accessibilityRole="button"
                  style={({ pressed }) => [themed.primaryButton, pressed && themed.primaryButtonPressed]}
                >
                  <Text style={themed.primaryButtonText} maxFontSizeMultiplier={1.3}>
                    {t('loading.retry')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onContinue}
                  accessibilityRole="button"
                  style={({ pressed }) => [themed.secondaryButton, pressed && themed.secondaryButtonPressed]}
                >
                  <Text style={themed.secondaryButtonText} maxFontSizeMultiplier={1.3}>
                    {t('loading.continueOffline')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: 28 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 24, paddingBottom: 16 },
  logoStage: { width: 320, height: 320, maxWidth: '100%', alignItems: 'center', justifyContent: 'center' },
  pitch: { position: 'absolute' },
  ring: { position: 'absolute', width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: LOGO_SIZE / 2, borderWidth: 2 },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: LOGO_SIZE / 2 },
  footer: { alignItems: 'center', paddingTop: 12, paddingBottom: 36, minHeight: 120 },
  track: { width: BAR_WIDTH, height: 4, borderRadius: 2, overflow: 'hidden' },
  segment: { position: 'absolute', top: 0, bottom: 0, start: 0, width: BAR_SEGMENT, borderRadius: 2 },
  errorBlock: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 10 },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    brand: { marginTop: 8, fontFamily: fonts.headline, fontSize: 28, letterSpacing: -0.6, color: colors.textPrimary, textAlign: 'center' },
    brandAccent: { color: colors.primary },
    status: { marginTop: 16, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textFaint, textAlign: 'center' },
    errorTitle: { fontFamily: fonts.headline, fontSize: 18, lineHeight: 24, color: colors.textPrimary, textAlign: 'center' },
    errorBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textFaint, textAlign: 'center', marginBottom: 8 },
    primaryButton: {
      alignSelf: 'stretch',
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
    },
    primaryButtonPressed: { opacity: 0.85 },
    primaryButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.highlightText, textAlign: 'center' },
    secondaryButton: {
      alignSelf: 'stretch',
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryButtonPressed: { backgroundColor: colors.border },
    secondaryButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  });
