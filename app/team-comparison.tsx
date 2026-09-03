import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useAppData } from '@/contexts/DataContext';
import type { Match, Team } from '@/data/mockData';
import RadarChart, { type RadarAxis } from '@/components/RadarChart';

/** Real per-team stats derived client-side from whatever matches involving this team are
 * currently loaded (no new backend endpoint needed). Thin samples are a known limitation
 * of the $0 data tier — same caveat already documented for team_form on the backend. */
function teamAggregate(team: Team, matches: Match[]) {
  const involved = matches.filter((m) => m.home.id === team.id || m.away.id === team.id);
  const formPts = team.form.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
  const formScore = team.form.length > 0 ? formPts / (team.form.length * 3) : 0.5;
  if (involved.length === 0) return { formScore, xgScore: null, defenceScore: null, homeFormScore: formScore };

  const scale = team.sport === 'basketball' ? 130 : 3;
  let xgSum = 0;
  let againstSum = 0;
  let homePts = 0;
  let homeGames = 0;
  involved.forEach((m) => {
    const isHome = m.home.id === team.id;
    xgSum += isHome ? m.xgHome : m.xgAway;
    againstSum += isHome ? m.xgAway : m.xgHome;
    if (isHome) {
      homeGames += 1;
      homePts += m.outcomes.home >= m.outcomes.away && m.outcomes.home >= m.outcomes.draw ? 3 : m.outcomes.draw >= m.outcomes.away ? 1 : 0;
    }
  });
  const xgScore = Math.min(1, xgSum / involved.length / scale);
  const defenceScore = Math.max(0, 1 - againstSum / involved.length / scale);
  const homeFormScore = homeGames > 0 ? Math.min(1, homePts / (homeGames * 3)) : formScore;

  return { formScore, xgScore, defenceScore, homeFormScore };
}

export default function TeamComparisonScreen() {
  const { t } = useTranslation();
  const { a, b } = useLocalSearchParams<{ a?: string; b?: string }>();
  const { teams, matches } = useAppData();
  const teamList = Object.values(teams);
  const teamA = teams[a ?? ''] ?? teamList[0];
  const teamB = teams[b ?? ''] ?? teamList[1] ?? teamList[0];

  const statsA = useMemo(() => teamAggregate(teamA, matches), [teamA, matches]);
  const statsB = useMemo(() => teamAggregate(teamB, matches), [teamB, matches]);

  const axes: RadarAxis[] = [
    { key: 'axisForm', label: t('teamComparison.axisForm'), a: statsA.formScore, b: statsB.formScore },
    { key: 'axisXg', label: t('teamComparison.axisXg'), a: statsA.xgScore, b: statsB.xgScore },
    { key: 'axisPressing', label: t('teamComparison.axisPressing'), a: null, b: null },
    { key: 'axisPossession', label: t('teamComparison.axisPossession'), a: null, b: null },
    { key: 'axisDefence', label: t('teamComparison.axisDefence'), a: statsA.defenceScore, b: statsB.defenceScore },
    { key: 'axisHomeForm', label: t('teamComparison.axisHomeForm'), a: statsA.homeFormScore, b: statsB.homeFormScore },
  ];

  const gaps = axes
    .filter((ax) => ax.a !== null && ax.b !== null)
    .map((ax) => ({ label: ax.label, diff: (ax.a as number) - (ax.b as number) }));
  const biggestForA = [...gaps].sort((x, y) => y.diff - x.diff)[0];
  const biggestForB = [...gaps].sort((x, y) => x.diff - y.diff)[0];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('teamComparison.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.teamsRow}>
          <View style={styles.teamCol}>
            <View style={[styles.crest, { backgroundColor: teamA.bg }]}>
              <Text style={[styles.crestText, { color: teamA.fg }]}>{teamA.code}</Text>
            </View>
            <Text style={styles.teamName}>{teamA.name}</Text>
          </View>
          <Text style={styles.vs}>{t('common.vs')}</Text>
          <View style={styles.teamCol}>
            <Text style={styles.teamName}>{teamB.name}</Text>
            <View style={[styles.crest, { backgroundColor: teamB.bg }]}>
              <Text style={[styles.crestText, { color: teamB.fg }]}>{teamB.code}</Text>
            </View>
          </View>
        </View>

        <View style={styles.radarCard}>
          <RadarChart axes={axes} />
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>{teamA.name}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.neutralSeries }]} />
              <Text style={styles.legendText}>{teamB.name}</Text>
            </View>
          </View>
        </View>

        {biggestForA && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{t('teamComparison.strength', { team: teamA.name })}</Text>
            <Text style={styles.summaryText}>{t('teamComparison.strengthSentence', { axis: biggestForA.label.toLowerCase() })}</Text>
          </View>
        )}
        {biggestForB && (
          <View style={[styles.summaryCard, { marginBottom: 0 }]}>
            <Text style={[styles.summaryTitle, { color: colors.textSecondary }]}>{t('teamComparison.strength', { team: teamB.name })}</Text>
            <Text style={styles.summaryText}>{t('teamComparison.strengthSentence', { axis: biggestForB.label.toLowerCase() })}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondaryAlt },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 60 },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, marginTop: 6 },
  teamCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  crest: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  crestText: { fontFamily: fonts.bodyBold, fontSize: 10 },
  teamName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  vs: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFainter },
  radarCard: { marginTop: 14, padding: 16, paddingTop: 18, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center' },
  legendRow: { flexDirection: 'row', gap: 18, marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  summaryCard: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, marginTop: 12 },
  summaryTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primaryText, marginBottom: 5 },
  summaryText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textTertiary },
});
