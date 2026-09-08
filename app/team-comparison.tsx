import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, ShieldIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useAppData } from '@/contexts/DataContext';
import type { Match, Team } from '@/data/mockData';
import { resolveTeamById } from '@/data/liveData';
import RadarChart, { type RadarAxis } from '@/components/RadarChart';
import NotFoundState from '@/components/NotFoundState';
import { hasTrustedFormSample } from '@/data/dataConfidence';

/** Real per-team stats derived client-side from whatever matches involving this team are
 * currently loaded (no new backend endpoint needed). Thin samples are a known limitation
 * of the $0 data tier — same caveat already documented for team_form on the backend.
 * formScore/homeFormScore fall back to `null` (an honest "no data" spoke on the radar,
 * same mechanism already used for xgScore/defenceScore below) rather than the old default
 * of a flat 0.5 for a team with too little real form history — that 0.5 plotted exactly
 * like a genuine "even record" reading, which is indistinguishable from a guessed
 * statistic. Same >=3-match bar as everywhere else (data/dataConfidence.ts). */
function teamAggregate(team: Team, matches: Match[]) {
  const involved = matches.filter((m) => m.home.id === team.id || m.away.id === team.id);
  const formPts = team.form.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
  const formScore = hasTrustedFormSample(team.form) ? formPts / (team.form.length * 3) : null;
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
  const { t, i18n } = useTranslation();
  const { a, b } = useLocalSearchParams<{ a?: string; b?: string }>();
  const { teams, matches, isLive } = useAppData();
  const localTeamA = (a && teams[a]) || null;
  const localTeamB = (b && teams[b]) || null;

  // Same rationale as match/[id].tsx and team/[id].tsx: a team absent from the bulk-
  // loaded `teams` map is not the same as an invalid id. The only real caller of this
  // screen (Match Analysis's "Compare" button) always passes two real, currently-loaded
  // team ids — the only way either can fail to resolve here is a stale/shared deep link,
  // never a legitimate "no team selected" case, so neither side ever falls back to an
  // arbitrary team from the loaded map.
  const [fallbackA, setFallbackA] = useState<Team | null>(null);
  const [fallbackB, setFallbackB] = useState<Team | null>(null);
  const [resolving, setResolving] = useState(false);
  useEffect(() => {
    const needsA = !localTeamA && !!a;
    const needsB = !localTeamB && !!b;
    if (!needsA && !needsB) {
      setFallbackA(null);
      setFallbackB(null);
      setResolving(false);
      return;
    }
    if (!isLive) {
      setResolving(false);
      return;
    }
    let cancelled = false;
    setResolving(true);
    Promise.all([needsA ? resolveTeamById(a!) : Promise.resolve(null), needsB ? resolveTeamById(b!) : Promise.resolve(null)]).then(
      ([resolvedA, resolvedB]) => {
        if (!cancelled) {
          setFallbackA(resolvedA);
          setFallbackB(resolvedB);
          setResolving(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [localTeamA, localTeamB, a, b, isLive]);

  const teamA = localTeamA ?? fallbackA;
  const teamB = localTeamB ?? fallbackB;

  const statsA = useMemo(() => (teamA ? teamAggregate(teamA, matches) : null), [teamA, matches]);
  const statsB = useMemo(() => (teamB ? teamAggregate(teamB, matches) : null), [teamB, matches]);

  if (!teamA || !teamB) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
            <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('teamComparison.title')}</Text>
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

  // Pressing/possession used to sit here permanently as `a: null, b: null` — always
  // rendered, never once computable on the current data tier (no provider gives per-team
  // pressing/possession stats). Every real comparison a user ever opens showed the exact
  // same two "no data" spokes, which taught nothing and just diluted the 4 axes that are
  // real. Dropped rather than kept as permanent filler; RadarChart itself stays generic
  // (still accepts a null axis) for a metric that's occasionally missing, not always.
  const axes: RadarAxis[] = [
    { key: 'axisForm', label: t('teamComparison.axisForm'), a: statsA!.formScore, b: statsB!.formScore },
    { key: 'axisXg', label: t('teamComparison.axisXg'), a: statsA!.xgScore, b: statsB!.xgScore },
    { key: 'axisDefence', label: t('teamComparison.axisDefence'), a: statsA!.defenceScore, b: statsB!.defenceScore },
    { key: 'axisHomeForm', label: t('teamComparison.axisHomeForm'), a: statsA!.homeFormScore, b: statsB!.homeFormScore },
  ];

  // Lowercasing each axis label for mid-sentence embedding ("...the biggest gap is in
  // form.") is correct for every axis except xG, whose "xG" casing is intentional in
  // every locale and must never be lowered to "xg". Uses toLocaleLowerCase(currentLocale)
  // rather than plain toLowerCase() so Turkish's "İç saha" lowercases to the correct
  // dotless "iç saha" instead of JS's locale-unaware "i̇ç saha".
  const gaps = axes
    .filter((ax) => ax.a !== null && ax.b !== null)
    .map((ax) => ({
      label: ax.key === 'axisXg' ? ax.label : ax.label.toLocaleLowerCase(i18n.language),
      diff: (ax.a as number) - (ax.b as number),
    }));
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
            <Text style={styles.summaryText}>{t('teamComparison.strengthSentence', { axis: biggestForA.label })}</Text>
          </View>
        )}
        {biggestForB && (
          <View style={[styles.summaryCard, { marginBottom: 0 }]}>
            <Text style={[styles.summaryTitle, { color: colors.textSecondary }]}>{t('teamComparison.strength', { team: teamB.name })}</Text>
            <Text style={styles.summaryText}>{t('teamComparison.strengthSentence', { axis: biggestForB.label })}</Text>
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
