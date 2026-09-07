import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon, ShieldIcon } from 'phosphor-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, spacing } from '@/constants/theme';
import type { Team } from '@/data/mockData';
import { resolveTeamById } from '@/data/liveData';
import { useAppData } from '@/contexts/DataContext';
import TeamIntelligence from '@/components/TeamIntelligence';
import Disclaimer from '@/components/Disclaimer';
import NotFoundState from '@/components/NotFoundState';

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
  const { teams, matches, analysisChanges, isLive } = useAppData();
  const localTeam = (teamId && teams[teamId]) || null;

  // Same rationale as team/[id].tsx and match/[id].tsx: a team absent from the bulk-
  // loaded `teams` map is not the same as an invalid id. resolveTeamById asks Supabase
  // directly. This must NEVER fall back to FollowedTeamsContext or any other team —
  // this route's whole point is showing exactly the team the CTA linked to, or an honest
  // not-found, never a silent switch to whichever team the normal Insights tab happens
  // to have selected.
  const [fallbackTeam, setFallbackTeam] = useState<Team | null>(null);
  const [resolving, setResolving] = useState(false);
  useEffect(() => {
    if (localTeam || !teamId) {
      setFallbackTeam(null);
      setResolving(false);
      return;
    }
    if (!isLive) {
      setResolving(false);
      return;
    }
    let cancelled = false;
    setResolving(true);
    resolveTeamById(teamId).then((resolved) => {
      if (!cancelled) {
        setFallbackTeam(resolved);
        setResolving(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [localTeam, teamId, isLive]);

  const team = localTeam ?? fallbackTeam;

  const nextMatch = useMemo(
    () => (team ? matches.find((m) => m.home.id === team.id || m.away.id === team.id) ?? null : null),
    [matches, team],
  );
  const teamAnalysisChanges = useMemo(
    () => (nextMatch ? analysisChanges.filter((e) => e.matchId === nextMatch.id) : []),
    [analysisChanges, nextMatch],
  );

  if (!team) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
            <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('insights.title')}</Text>
          <View style={styles.iconButton} />
        </View>
        {!resolving && (
          <NotFoundState
            icon={ShieldIcon}
            title={t('notFound.teamTitle')}
            body={t('notFound.teamBody')}
            ctaLabel={t('common.goBack')}
            onPressCta={() => router.back()}
          />
        )}
      </SafeAreaView>
    );
  }

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
