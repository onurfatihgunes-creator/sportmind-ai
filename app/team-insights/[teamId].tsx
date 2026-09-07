import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon } from 'phosphor-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAppData } from '@/contexts/DataContext';
import TeamIntelligence from '@/components/TeamIntelligence';
import Disclaimer from '@/components/Disclaimer';

/** Contextual Team Insights — reached only from Match Analysis's per-team "AI Insights"
 * CTA. Answers "show me the SportMind view of this specific team from the match I'm
 * currently analyzing", not "what does SportMind think about my followed teams" (that's
 * the separate normal AI Insights tab, app/(tabs)/insights.tsx). Deliberately a
 * different shell around the same shared TeamIntelligence content/data derivation:
 * - the team comes directly and deterministically from the route param, never from
 *   FollowedTeamsContext or a stale/defaulted selection;
 * - there is no team selector, no chips, no follow/add-team UI, no 3-team management —
 *   this screen is read-only with respect to following, and entering or leaving it never
 *   follows, unfollows, or otherwise mutates FollowedTeamsContext;
 * - back returns to the exact Match Analysis screen the user came from via the normal
 *   router stack, not a tab switch. */
export default function TeamInsightsScreen() {
  const { t } = useTranslation();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { teams, matches, analysisChanges } = useAppData();
  const team = (teamId && teams[teamId]) || Object.values(teams)[0];

  const nextMatch = useMemo(
    () => matches.find((m) => m.home.id === team.id || m.away.id === team.id) ?? null,
    [matches, team],
  );
  const teamAnalysisChanges = useMemo(
    () => (nextMatch ? analysisChanges.filter((e) => e.matchId === nextMatch.id) : []),
    [analysisChanges, nextMatch],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('insights.title')}</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <View style={[styles.crest, { backgroundColor: team.bg }]}>
            <Text style={[styles.crestText, { color: team.fg }]}>{team.code}</Text>
          </View>
          <Text style={styles.teamName}>{team.name}</Text>
        </View>

        <TeamIntelligence team={team} nextMatch={nextMatch} analysisChanges={teamAnalysisChanges} />

        <Disclaimer style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondaryAlt },
  content: { paddingHorizontal: spacing.screenX, paddingTop: 10, paddingBottom: 60 },
  heroWrap: { alignItems: 'center', marginBottom: spacing.xl },
  crest: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  crestText: { fontFamily: fonts.bodyBold, fontSize: 14 },
  teamName: { fontFamily: fonts.headline, fontSize: 18, letterSpacing: -0.3, color: colors.textPrimary, marginTop: spacing.sm, textAlign: 'center' },
});
