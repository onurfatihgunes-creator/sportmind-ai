import { ArrowLeftIcon, ArrowRightIcon } from 'phosphor-react-native';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { isRTLLayout } from '@/hooks/useAdaptiveLayout';
import { useAppTheme } from '@/contexts/ThemeContext';

/**
 * The header back button every screen already had its own copy of — same
 * 44x44/hitSlop-12/size-20/weight-bold Pressable+Icon everywhere, but always
 * `ArrowLeftIcon`, never flipped for RTL (confirmed live: the button correctly
 * moves to the right side of an Arabic header, but the chevron itself kept
 * pointing left — backwards for RTL reading direction). One place to get this
 * right instead of ~15 hardcoded copies. `style` is still the caller's own
 * `styles.iconButton`, so no screen's layout changes; only the icon's
 * direction and (optionally) `onPress` are decided here.
 */
export default function BackButton({
  style,
  onPress,
  accessibilityLabel,
}: {
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Passed straight through — a picker's own "close" button reads better as
   * "Close" than "Back" to a screen reader, even though it renders the same
   * chevron as router.back() everywhere else. */
  accessibilityLabel?: string;
}) {
  const { colors } = useAppTheme();
  const Icon = isRTLLayout() ? ArrowRightIcon : ArrowLeftIcon;
  return (
    <Pressable
      style={style}
      onPress={onPress ?? (() => router.back())}
      hitSlop={12}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'button' : undefined}
    >
      <Icon size={20} weight="bold" color={colors.textSecondary} />
    </Pressable>
  );
}
