import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon, CheckIcon, DeviceMobileIcon, MoonIcon, SunIcon } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { fonts, radius, spacing, type ThemeColors } from '@/constants/theme';
import { useAppTheme, type ThemeMode } from '@/contexts/ThemeContext';
import { singleColumnStyle, useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';

const MODES: { mode: ThemeMode; Icon: typeof SunIcon }[] = [
  { mode: 'system', Icon: DeviceMobileIcon },
  { mode: 'light', Icon: SunIcon },
  { mode: 'dark', Icon: MoonIcon },
];

export default function AppearanceScreen() {
  const layout = useAdaptiveLayout();
  const { t } = useTranslation();
  const { mode, colors, setMode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('appearance.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, singleColumnStyle(layout)]}>
        <View style={styles.group}>
          {MODES.map(({ mode: rowMode, Icon }, index) => (
            <Pressable
              key={rowMode}
              onPress={() => setMode(rowMode)}
              style={[styles.row, index < MODES.length - 1 && styles.rowBorder]}
            >
              <Icon size={18} color={colors.textSecondary} />
              <Text style={styles.label}>{t(`appearance.${rowMode}`)}</Text>
              {mode === rowMode && <CheckIcon size={16} weight="bold" color={colors.primary} />}
            </Pressable>
          ))}
        </View>
        <Text style={styles.note}>{t('appearance.systemNote')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingBottom: 4 },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
    content: { paddingHorizontal: spacing.screenX, paddingTop: 10, paddingBottom: 60 },
    group: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 52 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    label: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
    note: { fontFamily: fonts.body, fontSize: 11, lineHeight: 17, color: colors.textFaint, marginTop: 14 },
  });
