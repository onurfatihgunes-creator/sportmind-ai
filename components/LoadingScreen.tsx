import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { fonts } from '@/constants/theme';

/**
 * Splash artwork (assets/images/splash-art.png): the owner's design with its baked-in spinner and
 * "Loading match data..." removed, so both can be drawn live in exactly their original place.
 * Every position below is in the artwork's own pixels (941 x 1672), measured from the original,
 * and mapped to the screen with the same transform the artwork is drawn with.
 */
const ART = require('../assets/images/splash-art.png');
const ART_W = 941;
const ART_H = 1672;
/** Spinner: centre, outer radius and stroke width in artwork pixels. */
const RING_CX = 469.5;
const RING_CY = 1323.5;
const RING_OUTER_R = 54.5;
const RING_STROKE = 11;
/** "Loading match data...": horizontal centre and cap-height band (top of L .. baseline). */
const TEXT_CX = 472;
const TEXT_CAP_TOP = 1402;
const TEXT_BASELINE = 1429;
const SPIN_MS = 1100;

export type LoadingState = 'loading' | 'ready' | 'error';

type Props = {
  state: LoadingState;
  onRetry: () => void;
  onContinue: () => void;
  /** Called by the Start button once loading has finished. */
  onStart?: () => void;
};

/**
 * "Cover" placement of the artwork. Phones (taller than the art) crop the sides equally; wider
 * screens (tablets) crop top and bottom, taking more from the bottom so the logo at the top is
 * never clipped. Returns the scale and the artwork's top-left corner on screen.
 */
export function artLayout(screenW: number, screenH: number) {
  const scale = Math.max(screenW / ART_W, screenH / ART_H);
  const w = ART_W * scale;
  const h = ART_H * scale;
  const left = (screenW - w) / 2;
  const top = h > screenH ? -(h - screenH) * 0.35 : (screenH - h) / 2;
  return { scale, left, top, width: w, height: h };
}

/** Colour stops of the original ring, clockwise from the faded tail (0) to the white head (1). */
const RING_STOPS: { at: number; rgb: [number, number, number]; alpha: number }[] = [
  { at: 0, rgb: [150, 80, 235], alpha: 0 },
  { at: 0.085, rgb: [150, 80, 235], alpha: 0.28 },
  { at: 0.17, rgb: [160, 82, 240], alpha: 0.6 },
  { at: 0.255, rgb: [170, 88, 245], alpha: 0.92 },
  { at: 0.3, rgb: [183, 94, 250], alpha: 1 },
  { at: 0.64, rgb: [174, 85, 251], alpha: 1 },
  { at: 0.72, rgb: [199, 123, 253], alpha: 1 },
  { at: 0.765, rgb: [233, 196, 255], alpha: 1 },
  { at: 0.81, rgb: [252, 252, 250], alpha: 1 },
  { at: 1, rgb: [252, 252, 250], alpha: 1 },
];
/** The arc runs from 45° (tail) clockwise to ~38° (head): a 353° sweep with a small gap. */
const TAIL_DEG = 45;
const SWEEP_DEG = 353;
const SEGMENTS = 96;

function stopAt(f: number) {
  let i = 0;
  while (i < RING_STOPS.length - 2 && RING_STOPS[i + 1].at < f) i++;
  const a = RING_STOPS[i];
  const b = RING_STOPS[i + 1];
  const t = Math.min(1, Math.max(0, (f - a.at) / (b.at - a.at || 1)));
  const rgb = a.rgb.map((v, k) => Math.round(v + (b.rgb[k] - v) * t));
  return { color: `rgb(${rgb.join(',')})`, alpha: a.alpha + (b.alpha - a.alpha) * t };
}

/** Point on the circle, angle in degrees clockwise from 12 o'clock. */
function polar(c: number, r: number, deg: number) {
  const t = (deg * Math.PI) / 180;
  return { x: c + r * Math.sin(t), y: c - r * Math.cos(t) };
}

/** The original spinner, redrawn: a gradient arc made of short segments, white rounded head. */
function SplashSpinner({ size, stroke, animate, label }: { size: number; stroke: number; animate: boolean; label: string }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    if (!animate) return;
    rotation.value = withRepeat(withTiming(360, { duration: SPIN_MS, easing: Easing.linear }), -1, false);
  }, [animate]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  const c = size / 2;
  const r = c - stroke / 2;
  const step = SWEEP_DEG / SEGMENTS;
  const segments = Array.from({ length: SEGMENTS }, (_, i) => {
    const from = TAIL_DEG + i * step;
    const to = from + step + 0.6; // slight overlap hides seams between segments
    const p0 = polar(c, r, from);
    const p1 = polar(c, r, to);
    const { color, alpha } = stopAt((i + 0.5) / SEGMENTS);
    return { d: `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`, color, alpha };
  });
  const head = polar(c, r, TAIL_DEG + SWEEP_DEG);

  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[{ width: size, height: size }, spin]}
    >
      <Svg width={size} height={size}>
        {segments.map((s, i) => (
          <Path key={i} d={s.d} stroke={s.color} strokeOpacity={s.alpha} strokeWidth={stroke} fill="none" />
        ))}
        <Circle cx={head.x} cy={head.y} r={stroke / 2} fill="rgb(252,252,250)" />
      </Svg>
    </Animated.View>
  );
}

/**
 * The screen between the native splash and the first real screen. While data loads it shows the
 * splash artwork with the live spinner and "Loading match data..."; once loading has finished the
 * spinner and line give way to a Start button. If the load fails it says so plainly and offers
 * Retry or continuing with what the app already has offline.
 */
export default function LoadingScreen({ state, onRetry, onContinue, onStart }: Props) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const art = artLayout(width, height);
  const toX = (x: number) => art.left + x * art.scale;
  // On phones the block sits exactly where the artwork had it. Only where the cover crop would
  // push it below the safe area (wide screens such as tablets) is it lifted just enough to fit.
  const artTextBottom = art.top + TEXT_BASELINE * art.scale + 0.3 * ((TEXT_BASELINE - TEXT_CAP_TOP) * art.scale) / 0.727;
  const lift = Math.max(0, artTextBottom - (height - insets.bottom - 24));
  const toY = (y: number) => art.top + y * art.scale - lift;

  const ringSize = RING_OUTER_R * 2 * art.scale;
  const ringLeft = toX(RING_CX) - ringSize / 2;
  const ringTop = toY(RING_CY) - ringSize / 2;

  // Inter's cap height is 0.727 em: size the line so its capitals span the original's.
  const capPx = (TEXT_BASELINE - TEXT_CAP_TOP) * art.scale;
  const fontSize = capPx / 0.727;
  const lineHeight = fontSize * 1.25;
  // Place the line box so the cap band lands on the original (Inter ascender ~0.969 em,
  // half-leading (lineHeight - fontSize * 1.21) / 2 above it).
  const halfLeading = (lineHeight - fontSize * 1.21) / 2;
  const textTop = toY(TEXT_BASELINE) - halfLeading - fontSize * 0.969;
  const textWidth = width;

  // Exactly the artwork's line, kept for the whole wait (no changing status text).
  const status = t('loading.matchData');
  const words = status.split(' ');
  const firstWord = words[0];
  const rest = words.slice(1).join(' ');

  // Start button: centred on the spinner/line block it replaces.
  const blockCenterY = (toY(RING_CY - RING_OUTER_R) + toY(TEXT_BASELINE)) / 2;
  const buttonHeight = Math.max(48, 104 * art.scale);
  const buttonWidth = width - 48; // full width with 24 pt side margins

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Image
        source={ART}
        style={{ position: 'absolute', left: art.left, top: art.top, width: art.width, height: art.height }}
        resizeMode="stretch"
        accessibilityIgnoresInvertColors
        accessible
        accessibilityRole="image"
        accessibilityLabel="SportMind"
      />

      {state === 'loading' && (
        <>
          <View style={{ position: 'absolute', left: ringLeft, top: ringTop }}>
            <SplashSpinner size={ringSize} stroke={RING_STROKE * art.scale} animate={!reducedMotion} label={status} />
          </View>
          <View style={{ position: 'absolute', left: toX(TEXT_CX) - textWidth / 2, top: textTop, width: textWidth }} pointerEvents="none">
            <Text
              style={[styles.status, { fontSize, lineHeight }]}
              maxFontSizeMultiplier={1.2}
              numberOfLines={1}
              adjustsFontSizeToFit
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.statusFirst}>{firstWord}</Text>
              {rest ? ` ${rest}` : ''}
            </Text>
          </View>
        </>
      )}

      {state === 'ready' && (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(320)}
          style={{ position: 'absolute', left: (width - buttonWidth) / 2, top: blockCenterY - buttonHeight / 2, width: buttonWidth }}
        >
          <Pressable
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel={t('loading.start')}
            style={({ pressed }) => [styles.startButton, { height: buttonHeight, borderRadius: buttonHeight / 2 }, pressed && styles.startPressed]}
          >
            <LinearGradient
              colors={['#7C3AED', '#A855F7']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[StyleSheet.absoluteFill, { borderRadius: buttonHeight / 2 }]}
            />
            <Text style={[styles.startText, { fontSize: Math.max(16, 34 * art.scale) }]} maxFontSizeMultiplier={1.3}>
              {t('loading.start')}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {state === 'error' && (
        <View style={[styles.errorBlock, { bottom: Math.max(insets.bottom, 16) + 24 }]} accessibilityLiveRegion="polite">
          <Text style={styles.errorTitle} maxFontSizeMultiplier={1.3}>
            {t('loading.errorTitle')}
          </Text>
          <Text style={styles.errorBody} maxFontSizeMultiplier={1.3}>
            {t('loading.errorBody')}
          </Text>
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primaryButton, pressed && styles.startPressed]}
          >
            <Text style={styles.primaryButtonText} maxFontSizeMultiplier={1.3}>
              {t('loading.retry')}
            </Text>
          </Pressable>
          <Pressable
            onPress={onContinue}
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}
          >
            <Text style={styles.secondaryButtonText} maxFontSizeMultiplier={1.3}>
              {t('loading.continueOffline')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches the artwork's own edge colour, so nothing flashes before the image paints.
  root: { flex: 1, backgroundColor: '#140F3C', overflow: 'hidden' },
  status: { fontFamily: fonts.body, color: '#ECECF7', textAlign: 'center' },
  statusFirst: { color: '#D6D2F1' },
  startButton: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#A855F7',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  startPressed: { opacity: 0.85 },
  startText: { fontFamily: fonts.bodySemiBold, color: '#FFFFFF', letterSpacing: 0.3 },
  errorBlock: { position: 'absolute', left: 24, right: 24, alignItems: 'center', gap: 10 },
  errorTitle: { fontFamily: fonts.headline, fontSize: 18, lineHeight: 24, color: '#FFFFFF', textAlign: 'center' },
  errorBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: '#D6D2F1', textAlign: 'center', marginBottom: 8 },
  primaryButton: {
    alignSelf: 'stretch',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: '#8B5CF6',
  },
  primaryButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: '#FFFFFF', textAlign: 'center' },
  secondaryButton: {
    alignSelf: 'stretch',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  secondaryPressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  secondaryButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: '#FFFFFF', textAlign: 'center' },
});
