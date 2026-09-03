import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { LightningIcon } from 'phosphor-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, fonts, spacing } from '@/constants/theme';

const HAS_SEEN_WELCOME_KEY = 'sportmind_has_seen_welcome';
const LOOP_MS = 4200;

function insetStyle(v: number) {
  return { top: v, left: v, right: v, bottom: v };
}

function LogoLoop() {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  const floatT = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
    floatT.value = withRepeat(withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduceMotion ? 0 : interpolate(floatT.value, [0, 1], [0, -7]) }],
  }));

  const ringsStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1, transform: [{ scale: 1 }] };
    const opacity = interpolate(t.value, [0, 0.18, 0.72, 0.88, 1], [0, 1, 1, 0, 0]);
    const scale = interpolate(t.value, [0, 0.18, 0.72, 0.88, 1], [0.55, 1, 1, 1.25, 1.25]);
    return { opacity, transform: [{ scale }] };
  });

  const glowStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1 };
    const opacity = interpolate(t.value, [0, 0.22, 0.74, 0.92, 1], [0, 1, 1, 0, 0]);
    const scale = interpolate(t.value, [0, 0.22, 0.74, 0.92, 1], [0.6, 1, 1, 1.2, 1.2]);
    return { opacity, transform: [{ scale }] };
  });

  const boxStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1, borderRadius: 36, transform: [{ scale: 1 }, { rotate: '0deg' }] };
    const opacity = interpolate(t.value, [0, 0.2, 0.7, 0.86, 1], [0, 1, 1, 0, 0]);
    const scale = interpolate(t.value, [0, 0.2, 0.7, 0.86, 1], [0.4, 1, 1, 0.4, 0.4]);
    const rotate = interpolate(t.value, [0, 0.2, 0.86, 1], [-14, 0, 12, 12]);
    const borderRadius = interpolate(t.value, [0, 0.2, 0.86, 1], [62, 36, 62, 62]);
    return { opacity, borderRadius, transform: [{ scale }, { rotate: `${rotate}deg` }] };
  });

  const boltStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1, transform: [{ scale: 1 }] };
    const opacity = interpolate(t.value, [0, 0.22, 0.42, 0.66, 0.8, 1], [0, 0, 1, 1, 0, 0]);
    const scale = interpolate(t.value, [0, 0.22, 0.42, 0.66, 0.8, 1], [3.4, 3.4, 1, 1, 2.6, 2.6]);
    return { opacity, transform: [{ scale }] };
  });

  return (
    <Animated.View style={[styles.logoContainer, floatStyle]}>
      <Animated.View style={[styles.glow, glowStyle]} />
      <Animated.View style={[styles.ring, insetStyle(10), ringsStyle]} />
      <Animated.View style={[styles.ring, insetStyle(24), ringsStyle]} />
      <Animated.View style={[styles.ring, insetStyle(54), ringsStyle]} />
      <Animated.View style={[styles.box, boxStyle]}>
        <Animated.View style={boltStyle}>
          <LightningIcon size={70} weight="bold" color={colors.primaryTint} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

export default function WelcomeScreen() {
  const { t } = useTranslation();

  const finish = async () => {
    await AsyncStorage.setItem(HAS_SEEN_WELCOME_KEY, 'true');
    router.replace('/(tabs)');
  };

  return (
    <LinearGradient colors={[colors.backgroundGradientTop, colors.backgroundGradientBottom]} style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.logoSlot}>
          <LogoLoop />
        </View>

        <View style={styles.copy}>
          <Text style={styles.kicker}>{t('welcome.kicker')}</Text>
          <Text style={styles.title}>{t('welcome.title')}</Text>
          <Text style={styles.body}>{t('welcome.body')}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]} onPress={finish}>
            <Text style={styles.primaryButtonText}>{t('welcome.start')}</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={finish}>
            <Text style={styles.skipButtonText}>{t('welcome.skip')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: spacing.screenX, justifyContent: 'flex-end', paddingBottom: 24 },
  logoSlot: { position: 'absolute', top: 88, left: 0, right: 0, alignItems: 'center' },
  logoContainer: { width: 262, height: 262, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 131, backgroundColor: colors.primaryMuted },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1, borderColor: colors.primary, opacity: 0.22 },
  box: {
    width: 124,
    height: 124,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  copy: { marginBottom: 28 },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.textFaint, marginBottom: 12 },
  title: { fontFamily: fonts.headlineBold, fontSize: 32, lineHeight: 36, letterSpacing: -0.8, color: colors.textPrimary, marginBottom: 12 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.textTertiary, maxWidth: 290 },
  actions: { gap: 10 },
  primaryButton: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryButtonPressed: { backgroundColor: colors.primary },
  primaryButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.primaryText },
  skipButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  skipButtonText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textFaint },
});
