import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, fonts, radius } from '@/constants/theme';

export type ToastState = { id: number; message: string } | null;

/**
 * Shared, ephemeral bottom-anchored feedback pill — built because no toast/snackbar
 * pattern existed anywhere in this app yet (checked before writing this: bookmark/save
 * actions had zero visual confirmation, which is the actual bug this exists to fix, not a
 * cosmetic addition). Per-screen local state, not a global context: this is transient UI
 * feedback tied to one screen's own action, not app-wide state anything else needs to read.
 */
export function useToast() {
  const [state, setState] = useState<ToastState>(null);
  const idRef = useRef(0);

  const showToast = (message: string) => {
    idRef.current += 1;
    setState({ id: idRef.current, message });
    // Screen-reader announcement — accessibilityLiveRegion is Android-only, this is the
    // cross-platform way to actually speak a transient message on iOS too.
    AccessibilityInfo.announceForAccessibility(message);
  };

  return { toastState: state, showToast };
}

const VISIBLE_DURATION_MS = 1800;

export default function Toast({ state }: { state: ToastState }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const [renderedMessage, setRenderedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    setRenderedMessage(state.message);
    opacity.value = reduceMotion ? 1 : 0;
    opacity.value = withTiming(1, { duration: reduceMotion ? 0 : 180 });
    const hideTimer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: reduceMotion ? 0 : 220 });
    }, VISIBLE_DURATION_MS);
    return () => clearTimeout(hideTimer);
    // Re-fires on every new toast (state.id changes even for the same message text twice
    // in a row, e.g. rapid re-tapping), never just on message content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.id]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: (1 - opacity.value) * 8 }],
  }));

  if (!renderedMessage) return null;

  return (
    <Animated.View style={[styles.wrap, animatedStyle]} pointerEvents="none">
      <Text style={styles.text} numberOfLines={2}>
        {renderedMessage}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 28,
    backgroundColor: colors.textPrimary,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.background, textAlign: 'center' },
});
