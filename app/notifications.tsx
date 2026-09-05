import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import Toggle from '@/components/Toggle';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const [toggles, setToggles] = useState({ confidence: true, lineups: true });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.toggleCard}>
          <ToggleRow
            title={t('notifications.confidenceChanges')}
            subtitle={t('notifications.confidenceChangesSubtitle')}
            value={toggles.confidence}
            onChange={(v) => setToggles((s) => ({ ...s, confidence: v }))}
          />
          <View style={styles.toggleDivider} />
          <ToggleRow
            title={t('notifications.lineupsPublished')}
            subtitle={t('notifications.lineupsPublishedSubtitle')}
            value={toggles.lineups}
            onChange={(v) => setToggles((s) => ({ ...s, lineups: v }))}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({ title, subtitle, value, onChange }: { title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      <Toggle value={value} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.screenX, paddingTop: 10, paddingBottom: 60 },
  toggleCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, minHeight: 52 },
  toggleDivider: { height: 1, backgroundColor: colors.divider },
  toggleTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  toggleSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 1 },
});
