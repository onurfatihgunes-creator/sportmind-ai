import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, ShieldIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing, toneMutedColor, toneTextColor } from '@/constants/theme';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { useAppData } from '@/contexts/DataContext';
import type { Match, Team } from '@/data/mockData';
import { resolveTeamById } from '@/data/liveData';
import RadarChart, { type RadarAxis } from '@/components/RadarChart';
import SplitPane from '@/components/SplitPane';
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
  const { t } = useTranslation();
  const { a, b } = useLocalSearchParams<{ a?: string; b?: string }>();
  const { teams, matches, isLive } = useAppData();
  const layout = useAdaptiveLayout();
  const dual = layout.panes === 'dual';
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

  // Real per-axis gaps, computed straight from the same axes[] the radar itself plots —
  // never a separate/invented dataset. A gap below MIN_MEANINGFUL_GAP is treated as
  // "roughly even" and excluded from both teams' chip lists rather than crediting either
  // side with a "strength" that's really a rounding-level difference.
  const MIN_MEANINGFUL_GAP = 0.08;
  const gaps = axes.filter((ax) => ax.a !== null && ax.b !== null).map((ax) => ({ key: ax.key, label: ax.label, diff: (ax.a as number) - (ax.b as number) }));
  const strengthsForA = gaps.filter((g) => g.diff > MIN_MEANINGFUL_GAP).sort((x, y) => y.diff - x.diff);
  const strengthsForB = gaps.filter((g) => g.diff < -MIN_MEANINGFUL_GAP).sort((x, y) => x.diff - y.diff);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('teamComparison.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* DATA -> INTERPRETATION. The radar and who is being compared on one side, the
            per-axis reading of it on the other — the chart keeps its own fixed size
            rather than being stretched to fill a wider window. */}
        <SplitPane
          dual={dual}
          primaryFlex={1}
          secondaryFlex={1}
          primary={<View>
          <View style={styles.teamsRow}>
            <View style={styles.teamCol}>
              <View style={[styles.crest, { backgroundColor: teamA.bg }]}>
                <Text style={[styles.crestText, { color: teamA.fg }]}>{teamA.code}</Text>
              </View>
              <Text style={styles.teamName} numberOfLines={1}>
                {teamA.name}
              </Text>
            </View>
            <Text style={styles.vs}>{t('common.vs')}</Text>
            <View style={[styles.teamCol, styles.teamColEnd]}>
              <Text style={[styles.teamName, styles.teamNameEnd]} numberOfLines={1}>
                {teamB.name}
              </Text>
              <View style={[styles.crest, styles.crestFixed, { backgroundColor: teamB.bg }]}>
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
          </View>}
          secondary={<View style={dual ? styles.summaryColumnInPane : undefined}>
          {strengthsForA.length > 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{t('teamComparison.strength', { team: teamA.name })}</Text>
              <View style={styles.strengthChipRow}>
                {strengthsForA.map((g) => (
                  <View key={g.key} style={[styles.strengthChip, { backgroundColor: toneMutedColor('success') }]}>
                    <Text style={[styles.strengthChipText, { color: toneTextColor('success') }]}>{g.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {strengthsForB.length > 0 && (
            <View style={[styles.summaryCard, { marginBottom: 0 }]}>
              <Text style={[styles.summaryTitle, { color: colors.textSecondary }]}>{t('teamComparison.strength', { team: teamB.name })}</Text>
              <View style={styles.strengthChipRow}>
                {strengthsForB.map((g) => (
                  <View key={g.key} style={[styles.strengthChip, { backgroundColor: toneMutedColor('info') }]}>
                    <Text style={[styles.strengthChipText, { color: toneTextColor('info') }]}>{g.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {strengthsForA.length === 0 && strengthsForB.length === 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>{t('teamComparison.tooCloseToCall')}</Text>
            </View>
          )}
          </View>}
        />
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
  // minWidth: 0 overrides flexbox's default "never shrink below content size" — without
  // it, a long team name could push its own column (and the crest inside it) wider than
  // the row actually has room for, overflowing the card. Found live on the away side
  // specifically (styles.crestFixed's own comment covers the rest of that fix).
  teamCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  // The away column reverses child order (crest last) — justify to the end so it hugs
  // the card's right edge exactly as symmetrically as the home crest hugs the left,
  // regardless of how much (or little) space the team name text actually needs.
  teamColEnd: { justifyContent: 'flex-end' },
  crest: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  // flexShrink: 0 — a real bug found live: without it, a long away-team name could shrink
  // this flex row's LAST child (the crest) instead of the text, squashing the crest into
  // an oval and/or pushing it partially outside the card's own border.
  crestFixed: { flexShrink: 0 },
  crestText: { fontFamily: fonts.bodyBold, fontSize: 10 },
  // flexShrink: 1 lets a too-long name truncate (numberOfLines={1} + ellipsis) instead of
  // forcing the row wider than its container — the actual root cause of the reported
  // avatar-overflow bug (the crest wasn't broken, the name text next to it was unbounded).
  teamName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary, flexShrink: 1 },
  teamNameEnd: { textAlign: 'right' },
  vs: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFainter },
  radarCard: { marginTop: 14, padding: 16, paddingTop: 18, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center' },
  legendRow: { flexDirection: 'row', gap: 18, marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  summaryCard: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, marginTop: 12 },
  summaryTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primaryText, marginBottom: 8 },
  summaryText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textTertiary },
  strengthChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  // Beside the radar rather than under it, so the two columns start on the same line.
  // The first summary card carries its own 12pt gap-from-the-card-above, which only
  // means anything in the stacked layout; here there is nothing above it, so the column
  // pulls that back and leaves the 6pt the teams card opposite it starts at.
  summaryColumnInPane: { marginTop: -6 },
  strengthChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  strengthChipText: { fontFamily: fonts.bodySemiBold, fontSize: 11.5 },
});
