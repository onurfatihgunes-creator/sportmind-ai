import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { singleColumnStyle, useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import OnboardingHero from '@/components/OnboardingHero';

const DATA_POINTS = 1244;
// The hero artwork is laid out for at least this height; shorter screens scroll rather than crush it.
const HERO_MIN_HEIGHT = 400;
const HERO_SHARE = 0.58;

// Exact palette from design_handoff_sportmind_onboarding/README.md — this
// screen's own "Nocturne on light" hero treatment, kept local rather than
// merged into constants/theme.ts since it's specific to this one screen.
const hero = {
  page: '#f1effb',
  glow: '#9284d6',
  accent: '#7a68c4',
  accentDeep: '#5b4b8a',
  accentPressedText: '#4b3f7d',
  ink: '#23222e',
  inkStrong: '#2b2740',
  body: '#5f5b73',
  muted: '#8a83a8',
  label: '#4b4166',
  onAccent: '#f4f2fd',
  positive: '#4ac6a8',
  border: 'rgba(91,75,138,0.16)',
  borderCard: 'rgba(91,75,138,0.14)',
  divider: 'rgba(91,75,138,0.20)',
  track: 'rgba(91,75,138,0.14)',
};

function EntranceChip({
  delayMs,
  floatDurationMs,
  floatDelayMs,
  style,
  children,
}: {
  delayMs: number;
  floatDurationMs?: number;
  floatDelayMs?: number;
  style?: object;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const entrance = useSharedValue(reduceMotion ? 1 : 0);
  const float = useSharedValue(0);

  useEffect(() => {
    entrance.value = withDelay(reduceMotion ? 0 : delayMs, withTiming(1, { duration: reduceMotion ? 0 : 250, easing: Easing.out(Easing.cubic) }));
    if (reduceMotion || !floatDurationMs) return;
    float.value = withDelay(
      floatDelayMs ?? 0,
      withRepeat(withTiming(1, { duration: floatDurationMs / 2, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 10 + float.value * -6 },
      { scale: 0.96 + entrance.value * 0.04 },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

function ProgressFill({ pct, delayMs }: { pct: number; delayMs: number }) {
  const reduceMotion = useReducedMotion();
  const grow = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    grow.value = withDelay(reduceMotion ? 0 : delayMs, withTiming(1, { duration: reduceMotion ? 0 : 1400, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
  }, [reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: grow.value }],
  }));

  return (
    <View style={[styles.progressTrack]}>
      <Animated.View style={[{ width: `${pct}%`, height: '100%', transformOrigin: 'left' }, animatedStyle]}>
        <LinearGradient colors={[hero.accent, hero.accentDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.progressGradient} />
      </Animated.View>
    </View>
  );
}

/**
 * First-launch screen. `onFinish` is whatever should happen once "Get started" is tapped — the
 * root layout flips its first-launch gate; the /welcome route (deep links) navigates to the tabs.
 * The call is guarded so a double tap cannot run it twice.
 *
 * Layout: the hero and the copy scroll together, the CTA is pinned below them inside the safe
 * area. The CTA used to be the last item of the scrolling copy, so on a 360dp-wide phone (or any
 * large font scale) it sat below the fold and the first touch only stopped the scroll fling.
 */
export default function WelcomeScreen({ onFinish }: { onFinish: () => void | Promise<void> }) {
  const layout = useAdaptiveLayout();
  const { t, i18n } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dataPointsCount = DATA_POINTS.toLocaleString(i18n.language);
  const heroHeight = Math.max(HERO_MIN_HEIGHT, Math.round((windowHeight - insets.top - insets.bottom) * HERO_SHARE));

  const finishing = useRef(false);
  const finish = () => {
    if (finishing.current) return;
    finishing.current = true;
    Promise.resolve(onFinish()).catch(() => {
      finishing.current = false;
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.heroBlock, { height: heroHeight }]}>
        <OnboardingHero />

        <EntranceChip delayMs={0} style={styles.statusPillWrap}>
          <BlurView intensity={20} tint="light" style={styles.statusPill}>
            <View style={styles.statusPillTint} />
            <View style={styles.liveDotHalo}>
              <View style={styles.liveDot} />
            </View>
            <Text style={styles.statusTextPrimary}>{t('welcome.liveAnalysisLabel').toUpperCase()}</Text>
            <View style={styles.statusDivider} />
            <Text style={styles.statusTextSecondary}>{t('welcome.dataPointsLabel', { count: DATA_POINTS, countFormatted: dataPointsCount }).toUpperCase()}</Text>
          </BlurView>
        </EntranceChip>

        <EntranceChip delayMs={350} floatDurationMs={6000} floatDelayMs={800} style={styles.statCardLeftWrap}>
          <BlurView intensity={24} tint="light" style={styles.statCard}>
            <View style={styles.statCardTint} />
            <Text style={styles.statKicker}>{t('factors.expectedGoals').toUpperCase()}</Text>
            <View style={styles.statValueRow}>
              <Text style={styles.statValue}>2.14</Text>
              <Text style={styles.statDelta}>+0.38</Text>
            </View>
          </BlurView>
        </EntranceChip>

        <EntranceChip delayMs={550} floatDurationMs={7000} floatDelayMs={1600} style={styles.statCardRightWrap}>
          <BlurView intensity={24} tint="light" style={styles.statCard}>
            <View style={styles.statCardTint} />
            <Text style={styles.statKicker}>{t('welcome.passAccuracy').toUpperCase()}</Text>
            <View style={styles.statValueRow}>
              <Text style={styles.statValue}>
                91<Text style={styles.statValueUnit}>%</Text>
              </Text>
            </View>
            <ProgressFill pct={91} delayMs={1000} />
          </BlurView>
        </EntranceChip>
      </View>

      {/* The copy block is capped and centred on a wide window — a 26pt-padded
          paragraph stretched across an unfolded display is unreadable, and there is
          nothing real to put beside it. */}
      <View style={[styles.copy, singleColumnStyle(layout)]}>
        <View>
          <Text style={styles.badge}>{t('welcome.kicker').toUpperCase()}</Text>
        </View>
        <Text style={styles.title}>{t('welcome.title')}</Text>
        <Text style={styles.body}>{t('welcome.body')}</Text>
      </View>
      </ScrollView>

      <View style={[styles.footer, singleColumnStyle(layout)]}>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={finish}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>{t('welcome.start')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: hero.page },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  // Height is set inline from the window (HERO_SHARE of the safe area, never below
  // HERO_MIN_HEIGHT) — see WelcomeScreen.
  heroBlock: { position: 'relative' },
  copy: { paddingHorizontal: 26, paddingTop: 20, paddingBottom: 16, gap: 16 },
  // The CTA is outside the scroll view, so it is always on screen; the page colour keeps copy
  // that scrolls underneath it from showing through.
  footer: { paddingHorizontal: 26, paddingTop: 12, paddingBottom: 12, backgroundColor: hero.page },

  statusPillWrap: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: hero.border,
    overflow: 'hidden',
    shadowColor: '#3c306e',
    shadowOpacity: 0.08,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  statusPillTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.55)' },
  liveDotHalo: { width: 15, height: 15, borderRadius: 8, backgroundColor: 'rgba(74,198,168,0.18)', alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: hero.positive },
  statusTextPrimary: { fontSize: 11.5, letterSpacing: 1.15, fontWeight: '600', color: hero.label },
  statusDivider: { width: 1, height: 12, backgroundColor: hero.divider },
  statusTextSecondary: { fontSize: 11.5, letterSpacing: 1.15, fontWeight: '600', color: hero.muted },

  statCardLeftWrap: { position: 'absolute', left: 22, top: 96 },
  statCardRightWrap: { position: 'absolute', right: 22, top: 172 },
  statCard: {
    padding: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: hero.borderCard,
    overflow: 'hidden',
    minWidth: 108,
    shadowColor: '#3c306e',
    shadowOpacity: 0.1,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  statCardTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.68)' },
  statKicker: { fontSize: 10.5, letterSpacing: 1.26, fontWeight: '600', color: hero.muted },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 3 },
  statValue: { fontSize: 24, fontWeight: '700', letterSpacing: -0.48, color: hero.inkStrong },
  statValueUnit: { fontSize: 14, fontWeight: '600', color: hero.muted },
  statDelta: { fontSize: 11, fontWeight: '600', color: hero.positive },
  progressTrack: { marginTop: 7, height: 4, borderRadius: 2, backgroundColor: hero.track, overflow: 'hidden' },
  progressGradient: { width: '100%', height: '100%', borderRadius: 2 },

  badge: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: hero.accentDeep,
    color: hero.onAccent,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: { fontSize: 36, lineHeight: 39.6, letterSpacing: -1.08, fontWeight: '800', color: hero.ink },
  body: { fontSize: 16, lineHeight: 24, color: hero.body, maxWidth: 300 },
  primaryButton: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 14,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: hero.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: { backgroundColor: 'rgba(122,104,196,0.18)', borderColor: hero.accentDeep },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: hero.accentPressedText },
});
