import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { teams } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import TeamCrest from '@/components/TeamCrest';
import InsightCard from '@/components/InsightCard';

const watchlist = [
  { team: teams.arsenal, statusKey: 'confidenceUpdated', time: '2h', tone: colors.successText },
  { team: teams.liverpool, statusKey: 'lineupAnnounced', time: '5h', tone: colors.warningText },
  { team: teams.chelsea, statusKey: 'stableNoChanges', time: null, tone: colors.textMuted },
] as const;

export default function InsightsScreen() {
  const { t } = useTranslation();
  const { insights } = useAppData();
  const [toggles, setToggles] = useState({ confidence: true, lineups: true, newInsight: false });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('insights.title')}</Text>
        <Text style={styles.subtitle}>{t('insights.slotsUsed', { used: 3, total: 3 })}</Text>

        {watchlist.map((w) => (
          <Pressable
            key={w.team.id}
            style={styles.watchItem}
            onPress={() => router.push(`/what-changed/${w.team.id}`)}
          >
            <TeamCrest team={w.team} size={34} />
            <View style={styles.watchInfo}>
              <Text style={styles.watchName}>{w.team.name}</Text>
              <Text style={[styles.watchStatus, { color: w.tone }]}>
                {t(`insights.${w.statusKey}`, w.time ? { time: w.time } : undefined)}
              </Text>
            </View>
            <Feather name="bell" size={16} color={colors.primaryLight} />
          </Pressable>
        ))}

        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>{t('insights.notifyMeAbout')}</Text>
        <ToggleRow
          label={t('insights.confidenceChanges')}
          value={toggles.confidence}
          onChange={(v) => setToggles((prev) => ({ ...prev, confidence: v }))}
        />
        <ToggleRow
          label={t('insights.lineupsPublished')}
          value={toggles.lineups}
          onChange={(v) => setToggles((prev) => ({ ...prev, lineups: v }))}
        />
        <ToggleRow
          label={t('insights.newAiInsight')}
          value={toggles.newInsight}
          onChange={(v) => setToggles((prev) => ({ ...prev, newInsight: v }))}
        />

        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>{t('insights.latestAiInsights')}</Text>
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}

        <Pressable
          style={styles.compareLink}
          onPress={() => router.push({ pathname: '/team-comparison', params: { a: 'liverpool', b: 'chelsea' } })}
        >
          <Text style={styles.compareLinkText}>
            {t('insights.compareLink', { a: teams.liverpool.name, b: teams.chelsea.name })}
          </Text>
          <Feather name="arrow-right" size={14} color={colors.primaryLight} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#20202B', true: colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  title: { fontFamily: fonts.headline, fontSize: 22, color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted, marginTop: 3, marginBottom: spacing.lg },
  watchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: spacing.sm,
  },
  watchInfo: { flex: 1 },
  watchName: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
  watchStatus: { fontFamily: fonts.body, fontSize: 10.5, marginTop: 2 },
  sectionLabel: {
    fontFamily: fonts.headline,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  toggleLabel: { fontFamily: fonts.body, fontSize: 13, color: '#E5E7EB' },
  compareLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  compareLinkText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primaryLight },
});
