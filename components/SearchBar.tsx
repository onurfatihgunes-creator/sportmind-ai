import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, ViewStyle } from 'react-native';
import { MagnifyingGlassIcon } from 'phosphor-react-native';
import { colors, fonts, radius } from '@/constants/theme';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  height?: number;
  fontSize?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

/**
 * Shared search input — extracted from Explore's and AI Insights' previously-duplicated
 * search bars. Owns its own focus state so the container border can stand in for the
 * browser's native focus ring, which is explicitly suppressed on the input itself: on
 * web, react-native-web's TextInput renders a plain <input>, and Chromium's default
 * outline-style:auto renders a visible ring even at outlineWidth:0 unless outlineStyle is
 * first pinned to a real (non-auto) value — confirmed live earlier in this project.
 */
export default function SearchBar({
  value,
  onChangeText,
  placeholder,
  autoFocus,
  height = 44,
  fontSize = 14,
  style,
  accessibilityLabel,
}: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.bar, { height }, focused && styles.barFocused, style]}>
      <MagnifyingGlassIcon size={16} color={colors.textFainter} />
      <TextInput
        style={[styles.input, { fontSize }]}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.textFainter}
        autoFocus={autoFocus}
        accessibilityRole="search"
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  barFocused: { borderColor: colors.primary },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    color: colors.textPrimary,
    padding: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'solid', outlineWidth: 0 } : null),
  },
});
