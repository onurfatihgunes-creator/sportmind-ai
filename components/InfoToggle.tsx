import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { InfoIcon } from 'phosphor-react-native';
import { colors, fonts } from '@/constants/theme';

type Props = { label: string; explanation: string };

/**
 * Small "ⓘ" affordance that expands an inline plain-language explanation in place —
 * deliberately not a native Alert: react-native-web's Alert.alert renders no UI at all
 * (confirmed live earlier in this project), so a real cross-platform info surface has to
 * be built in-tree rather than relying on the native dialog.
 */
export default function InfoToggle({ label, explanation }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        style={styles.row}
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={explanation}
      >
        <Text style={styles.label}>{label}</Text>
        <InfoIcon size={13} color={colors.textFainter} />
      </Pressable>
      {open && <Text style={styles.explanation}>{explanation}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  explanation: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.textFaint, marginTop: 4, maxWidth: 320 },
});
