import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { router } from 'expo-router';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { insights, matches, teams } from '@/data/mockData';
import TeamCrest from '@/components/TeamCrest';
import InsightCard from '@/components/InsightCard';

const watchlist = [
  { team: teams.arsenal, status: 'Confidence updated · 2h ago', tone: colors.successText },
  { team: teams.liverpool, status: 'Lineup announced · 5h ago', tone: colors.warningText },
  { team: teams.chelsea, status: 'Stable · no changes', tone: colors.textMuted },
];

export default function InsightsScreen() {
  const [toggles, setToggles] = useState({ confidence: true, lineups: true, newInsight: false });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Watchlist</Text>
        <Text style={styles.subtitle}>3 of 3 free slots used</Text>

        {watchlist.map((w) => (
          <Pressable
            key={w.team.id}
            style={styles.watchItem}
            onPress={() => router.push(`/what-changed/${w.team.id}`)}
          >
            <TeamCrest team={w.team} size={34} />
            <View style={styles.watchInfo}>
              <Text style={styles.watchName}>{w.team.name}</Text>
              <Text style={[styles.watchStatus, { color: w.tone }]}>{w.status}</Text>
            </View>
            <Feather name="bell" size={16} color={colors.primaryLight} />
          </Pressable>
        ))}

        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Notify me about</Text>
        <ToggleRow
          label="Confidence changes"
          value={toggles.confidence}
          onChange={(v) => setToggles((t) => ({ ...t, confidence: v }))}
        />
        <ToggleRow
          label="Lineups published"
          value={toggles.lineups}
          onChange={(v) => setToggles((t) => ({ ...t, lineups: v }))}
        />
        <ToggleRow
          label="New AI insight"
          value={toggles.newInsight}
          onChange={(v) => setToggles((t) => ({ ...t, newInsight: v }))}
        />

        <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Latest AI insights</Text>
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}

        <Pressable
          style={styles.compareLink}
          onPress={() => router.push({ pathname: '/team-comparison', params: { a: 'liverpool', b: 'chelsea' } })}
        >
          <Text style={styles.compareLinkText}>Compare Liverpool and Chelsea</Text>
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
    padding: 12,
    marginBottom: spacing.sm,
  },
  watchInfo: { flex: 1 },
  watchName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
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
