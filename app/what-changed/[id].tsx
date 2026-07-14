import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { changeEvents } from '@/data/mockData';

const toneColor = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
} as const;

const toneTextColor = {
  success: colors.successText,
  warning: colors.warningText,
  danger: colors.dangerText,
} as const;

export default function WhatChangedScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('whatChanged.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.matchTitle}>Arsenal {t('common.vs')} Liverpool</Text>

        {changeEvents.map((event, index) => (
          <View key={event.id} style={styles.row}>
            <View style={styles.timelineCol}>
              <View style={[styles.dot, { backgroundColor: toneColor[event.tone] }]} />
              {index < changeEvents.length - 1 && <View style={styles.line} />}
            </View>
            <View style={styles.eventBody}>
              <Text style={styles.timestamp}>{event.timestamp}</Text>
              <Text style={styles.eventTitle}>{t(`changeEvents.${event.key}`)}</Text>
              <View style={styles.deltaRow}>
                <Text style={styles.deltaValue}>{event.from}%</Text>
                <Feather name="arrow-right" size={10} color={colors.textFaint} />
                <Text style={[styles.deltaValue, { color: toneTextColor[event.tone] }]}>{event.to}%</Text>
                <View style={[styles.deltaChip, { backgroundColor: `${toneColor[event.tone]}22` }]}>
                  <Text style={[styles.deltaChipText, { color: toneTextColor[event.tone] }]}>
                    {event.to - event.from > 0 ? '+' : ''}
                    {event.to - event.from}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ))}

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{t('whatChanged.onlyMaterialChanges')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 60 },
  matchTitle: { fontFamily: fonts.headline, fontSize: 15, color: colors.textPrimary, marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: 12 },
  timelineCol: { alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { width: 1.5, flex: 1, backgroundColor: colors.border, marginTop: 3, minHeight: 34 },
  eventBody: { flex: 1, paddingBottom: spacing.lg },
  timestamp: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textFaint },
  eventTitle: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textPrimary, marginTop: 3, marginBottom: 6 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deltaValue: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.textMuted },
  deltaChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  deltaChipText: { fontFamily: fonts.bodyMedium, fontSize: 10 },
  noteCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, marginTop: spacing.sm },
  noteText: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textMuted },
});
