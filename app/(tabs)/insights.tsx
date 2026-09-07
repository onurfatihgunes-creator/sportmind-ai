import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretRightIcon,
  CaretUpIcon,
  CheckIcon,
  PlusIcon,
  XIcon,
} from 'phosphor-react-native';
import { colors, fonts, radius, spacing, toneMutedColor, toneTextColor } from '@/constants/theme';
import { useAppData } from '@/contexts/DataContext';
import { useFollowedTeams, MAX_FOLLOWED_TEAMS } from '@/contexts/FollowedTeamsContext';
import type { AnalysisChangeEvent, ChangeEvent, LineupPlayer, Match, PlayerImpactEntry, Team } from '@/data/mockData';
import TeamPicker from '@/components/TeamPicker';
import TeamBadgePair from '@/components/TeamBadgePair';
import InfoToggle from '@/components/InfoToggle';
import Disclaimer from '@/components/Disclaimer';

type SignalDir = 'up' | 'down' | 'neutral';

/** Real, deterministic team-level FORM read from the team's own last-5 W/D/L —
 * mirrors the same kind of simple, documented threshold already used for player-impact
 * classification. undefined only when there's no form history at all yet. */
function formDirection(team: Team): SignalDir | undefined {
  if (team.form.length === 0) return undefined;
  const wins = team.form.filter((r) => r === 'W').length;
  const losses = team.form.filter((r) => r === 'L').length;
  if (wins >= 3) return 'up';
  if (losses >= 3) return 'down';
  return 'neutral';
}

/** BSD's `player_availability.reason` is free text and usually already a real phrase
 * ("Thigh Injury"), but for some statuses (seen live: suspensions) it's a raw
 * snake_case token like "red_card_suspension" instead — never shown to the user as-is;
 * this only reformats spacing/casing, it never invents or changes the underlying reason. */
function humanizeReason(reason: string): string {
  if (!reason.includes('_')) return reason;
  return reason
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const PLAYER_STATUS_KEY: Record<string, string> = {
  injured: 'insights.playerStatusInjured',
  suspended: 'insights.playerStatusSuspended',
  doubtful: 'insights.playerStatusDoubtful',
};

const CHANGE_TYPE_KEY: Record<string, string> = {
  player_unavailable: 'insights.changePlayerUnavailable',
  player_available_again: 'insights.changePlayerAvailableAgain',
};

const LINEUP_VALUE_KEY: Record<string, string> = {
  confirmed: 'insights.changeLineupConfirmed',
  predicted: 'insights.changeLineupPredicted',
  unavailable: 'insights.changeLineupUnavailable',
};

/** One real, human-readable "recent development" line, built only from change records
 * that actually exist (prediction_changes' percentage delta and/or analysis_changes'
 * lineup/availability events) — never a fabricated reason. */
function describeChange(event: AnalysisChangeEvent, t: (key: string, opts?: Record<string, unknown>) => string): string | null {
  if (event.changeType === 'lineup_status_changed') {
    const key = LINEUP_VALUE_KEY[event.newValue];
    return key ? t(key) : null;
  }
  const key = CHANGE_TYPE_KEY[event.changeType];
  return key ? t(key, { name: event.newValue }) : null;
}

export default function InsightsScreen() {
  const { t } = useTranslation();
  const { teams, matches, changeEvents, analysisChanges } = useAppData();
  const { teamIds, toggle: toggleTeam, canFollowMore } = useFollowedTeams();
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const followedTeams = teamIds.map((id) => teams[id]).filter(Boolean);

  // First followed team selected by default; if the selection becomes invalid (removed,
  // or nothing followed yet), fall back to the new first team rather than showing a dead
  // selection — never assumes exactly 3 teams, works for any follow limit.
  useEffect(() => {
    if (followedTeams.length === 0) {
      if (selectedTeamId !== null) setSelectedTeamId(null);
      return;
    }
    if (!selectedTeamId || !followedTeams.some((tm) => tm.id === selectedTeamId)) {
      setSelectedTeamId(followedTeams[0].id);
    }
  }, [followedTeams, selectedTeamId]);

  const selectedTeam: Team | null = followedTeams.find((tm) => tm.id === selectedTeamId) ?? null;

  // Team-level, not match-level: this is the team's own next scheduled fixture, used only
  // as (a) the source for squad-status/lineup facts that genuinely are match-scoped in the
  // data model, and (b) a small contextual link to the existing Match Analysis screen —
  // never as the primary subject of this screen anymore.
  const nextMatch = useMemo(() => {
    if (!selectedTeam) return null;
    return matches.find((m) => m.home.id === selectedTeam.id || m.away.id === selectedTeam.id) ?? null;
  }, [matches, selectedTeam]);

  const matchChangeEvent = useMemo(
    () => (nextMatch ? [...changeEvents].filter((e) => e.matchId === nextMatch.id).sort((a, b) => b.id.localeCompare(a.id))[0] : undefined),
    [changeEvents, nextMatch],
  );
  const matchAnalysisChanges = useMemo(() => (nextMatch ? analysisChanges.filter((e) => e.matchId === nextMatch.id) : []), [analysisChanges, nextMatch]);
  const hasAnyChange = Boolean(matchChangeEvent) || matchAnalysisChanges.length > 0;

  // Followed-team changes surface first — a change on a match the user has no connection
  // to is still real Change Intelligence, but far less relevant than the state above it.
  const followedMatchIds = useMemo(() => new Set(matches.filter((m) => teamIds.includes(m.home.id) || teamIds.includes(m.away.id)).map((m) => m.id)), [matches, teamIds]);
  // Filtered to events whose match is actually in the currently-loaded set BEFORE
  // slicing — a change event can reference a match outside today's loaded window, and
  // rendering would then have nothing to show for it. Filtering first means an empty
  // result here is a real "nothing to show" rather than 5 slots that all silently render
  // nothing with no empty-state fallback.
  const recentChanges = useMemo(() => {
    const withMatch = changeEvents.filter((e) => matches.some((m) => m.id === e.matchId));
    return [...withMatch].sort((a, b) => (followedMatchIds.has(b.matchId) ? 1 : 0) - (followedMatchIds.has(a.matchId) ? 1 : 0)).slice(0, 5);
  }, [changeEvents, matches, followedMatchIds]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('insights.title')}</Text>

        <Text style={styles.kicker}>{t('insights.followingKicker')}</Text>
        {followedTeams.length === 0 ? (
          <>
            <Text style={styles.followingEmptyText}>{t('insights.followingEmptyBody', { max: MAX_FOLLOWED_TEAMS })}</Text>
            <Pressable style={styles.addButton} onPress={() => setShowPicker(true)}>
              <PlusIcon size={13} weight="bold" color={colors.primaryLink} />
              <Text style={styles.addButtonText}>{t('insights.addTeamShort')}</Text>
            </Pressable>
          </>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {followedTeams.map((team) => {
              const selected = team.id === selectedTeamId;
              return (
                <Pressable
                  key={team.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setSelectedTeamId(team.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={selected ? t('insights.chipSelectedLabel', { team: team.name }) : team.name}
                >
                  {selected && <CheckIcon size={12} weight="bold" color={colors.primaryTint} />}
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                    {team.name}
                  </Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() => toggleTeam(team.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('insights.chipRemoveLabel', { team: team.name })}
                  >
                    <XIcon size={13} weight="bold" color={selected ? colors.primaryTint : colors.textFainter} />
                  </Pressable>
                </Pressable>
              );
            })}
            {canFollowMore && (
              <Pressable
                style={styles.addChip}
                onPress={() => setShowPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={t('insights.addTeamShort')}
              >
                <PlusIcon size={14} weight="bold" color={colors.primaryLink} />
              </Pressable>
            )}
          </ScrollView>
        )}

        <TeamPicker
          visible={showPicker}
          onClose={() => setShowPicker(false)}
          teams={teams}
          matches={matches}
          excludeIds={teamIds}
          search={pickerSearch}
          onSearchChange={setPickerSearch}
          title={t('insights.addTeamShort')}
          onSelect={(teamId) => {
            toggleTeam(teamId);
            setSelectedTeamId(teamId);
            setShowPicker(false);
            setPickerSearch('');
          }}
        />

        {selectedTeam && (
          <TeamIntelligence
            team={selectedTeam}
            nextMatch={nextMatch}
            changeEvent={matchChangeEvent}
            analysisChanges={matchAnalysisChanges}
            hasAnyChange={hasAnyChange}
          />
        )}

        <Text style={styles.kicker}>{t('insights.recentChangesKicker')}</Text>
        {recentChanges.length === 0 ? (
          <Text style={styles.followingEmptyText}>{t('insights.recentChangesEmpty')}</Text>
        ) : (
          <View style={{ gap: 8, marginBottom: 16 }}>
            {recentChanges.map((event) => {
              const match = matches.find((m) => m.id === event.matchId);
              if (!match) return null;
              const delta = event.to - event.from;
              return (
                <Pressable key={event.id} style={styles.changeRow} onPress={() => router.push(`/match/${match.id}?tab=change`)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.changeMatchup} numberOfLines={1}>
                      {match.home.name} <Text style={styles.changeVs}>{t('common.vs')}</Text> {match.away.name}
                    </Text>
                    <Text style={styles.changeDescription}>{t(`changeEvents.${event.key}`)}</Text>
                  </View>
                  <View style={[styles.deltaChip, { backgroundColor: delta >= 0 ? colors.successMuted : colors.warningMuted }]}>
                    <Text style={[styles.deltaChipText, { color: delta >= 0 ? colors.successText : colors.warningText }]}>
                      {delta > 0 ? '+' : ''}
                      {delta}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Disclaimer />
      </ScrollView>
    </SafeAreaView>
  );
}

function SignalRow({ label, direction }: { label: string; direction: SignalDir }) {
  const Icon = direction === 'up' ? ArrowUpIcon : direction === 'down' ? ArrowDownIcon : ArrowRightIcon;
  const tone = direction === 'up' ? colors.successText : direction === 'down' ? colors.dangerText : colors.textFaint;
  return (
    <View style={styles.signalRow}>
      <Text style={styles.signalLabel}>{label}</Text>
      <View style={styles.signalValue}>
        <Icon size={13} weight="bold" color={tone} />
      </View>
    </View>
  );
}

function PlayerImpactRow({ entry, first }: { entry: PlayerImpactEntry; first?: boolean }) {
  const { t } = useTranslation();
  const tone = entry.impact === 'high' ? 'danger' : entry.impact === 'medium' ? 'warning' : 'success';
  return (
    <View style={[styles.playerRow, first && styles.playerRowFirst]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.playerName}>{entry.playerName}</Text>
        <Text style={styles.playerStatus}>
          {PLAYER_STATUS_KEY[entry.status] ? t(PLAYER_STATUS_KEY[entry.status]) : entry.status}
          {entry.reason ? ` · ${humanizeReason(entry.reason)}` : ''}
        </Text>
      </View>
      <View style={[styles.impactChip, { backgroundColor: toneMutedColor(tone) }]}>
        <Text style={[styles.impactChipText, { color: toneTextColor(tone) }]}>{t(`insights.impact${entry.impact.charAt(0).toUpperCase()}${entry.impact.slice(1)}`)}</Text>
      </View>
    </View>
  );
}

function TeamIntelligence({
  team,
  nextMatch,
  changeEvent,
  analysisChanges,
  hasAnyChange,
}: {
  team: Team;
  nextMatch: Match | null;
  changeEvent: ChangeEvent | undefined;
  analysisChanges: AnalysisChangeEvent[];
  hasAnyChange: boolean;
}) {
  const { t } = useTranslation();
  const [squadExpanded, setSquadExpanded] = useState(false);

  const isHomeInNextMatch = nextMatch ? nextMatch.home.id === team.id : false;

  // Real, team-level signals only — never match/opponent-relative (that's Match
  // Analysis's job). form comes from the team's own last-5 W/D/L; attack/defence come
  // from a real before/after comparison of the team's own goals_for/goals_against
  // history (see data/liveData.ts's goalsTrend). Any signal without enough real history
  // is simply absent, never guessed.
  const form = formDirection(team);
  const signals: { key: 'form' | 'attack' | 'defence'; dir: SignalDir }[] = [
    form ? { key: 'form' as const, dir: form } : null,
    team.attackTrend ? { key: 'attack' as const, dir: team.attackTrend } : null,
    team.defenceTrend ? { key: 'defence' as const, dir: team.defenceTrend } : null,
  ].filter((s): s is { key: 'form' | 'attack' | 'defence'; dir: SignalDir } => s !== null);

  const upSignals = signals.filter((s) => s.dir === 'up');
  const downSignals = signals.filter((s) => s.dir === 'down');
  const overallTrend: 'positive' | 'negative' | 'stable' | 'mixed' | 'unknown' =
    signals.length === 0
      ? 'unknown'
      : upSignals.length > downSignals.length
        ? 'positive'
        : downSignals.length > upSignals.length
          ? 'negative'
          : upSignals.length > 0 && downSignals.length > 0
            ? 'mixed'
            : 'stable';

  // Team-level, not match-level: every player-facing section on this screen (unavailable
  // players, key players, squad status) is scoped to the followed team's own side of its
  // next match only — the opponent's players are Match Analysis's concern, never shown
  // here. Filtered once, at this view-model boundary, from the match-scoped `squadImpact`/
  // `lineups` data so no render path can accidentally reintroduce the opponent's side.
  const ownSquad = (nextMatch?.squadImpact ?? []).filter((e) => e.team === (isHomeInNextMatch ? 'home' : 'away'));
  const unavailableCount = ownSquad.length;
  const ownLineup: LineupPlayer[] = (isHomeInNextMatch ? nextMatch?.lineups?.home : nextMatch?.lineups?.away) ?? [];
  const hasSquadSection = unavailableCount > 0 || ownLineup.length > 0;
  const squadSummaryParts = [
    unavailableCount > 0 ? t('insights.squadImpactSummary', { count: unavailableCount }) : null,
    ownLineup.length > 0 ? t('insights.keyPlayersTrackedSummary', { count: ownLineup.length }) : null,
  ].filter((part): part is string => Boolean(part));

  // Trend headline + synthesis body: a small set of discrete, whole-sentence templates
  // (not runtime clause-concatenation) keyed by overall trend + which single signal is
  // most notable — safe across locales with very different word order/grammar, unlike
  // stitching independent phrase fragments together. Squad status is called out as a
  // separate trailing sentence (never blended into the up/down tally) only when there's
  // a real, current squad concern for the team's next match.
  const priority: ('form' | 'attack' | 'defence')[] = ['form', 'attack', 'defence'];
  const topPositiveKey = priority.find((k) => upSignals.some((s) => s.key === k));
  const topNegativeKey = priority.find((k) => downSignals.some((s) => s.key === k));
  const signalLabel = (key: 'form' | 'attack' | 'defence') => t(`insights.signalLabel${key.charAt(0).toUpperCase()}${key.slice(1)}`);

  let synthesisBody: string;
  if (overallTrend === 'unknown') {
    synthesisBody = t('insights.teamViewInsufficientData', { team: team.name });
  } else if (overallTrend === 'positive' && topPositiveKey) {
    synthesisBody = t('insights.teamViewPositive', { team: team.name, signal: signalLabel(topPositiveKey) });
  } else if (overallTrend === 'negative' && topNegativeKey) {
    synthesisBody = t('insights.teamViewNegative', { team: team.name, signal: signalLabel(topNegativeKey) });
  } else if (overallTrend === 'mixed' && topPositiveKey && topNegativeKey) {
    synthesisBody = t('insights.teamViewMixed', { team: team.name, positive: signalLabel(topPositiveKey), negative: signalLabel(topNegativeKey) });
  } else {
    synthesisBody = t('insights.teamViewStable', { team: team.name });
  }
  const squadCaveat = unavailableCount > 0 ? t('insights.teamViewSquadCaveat') : null;

  const trendHeadlineKey = { positive: 'insights.trendPositive', negative: 'insights.trendNegative', mixed: 'insights.trendMixed', stable: 'insights.trendStable', unknown: 'insights.trendUnknown' }[overallTrend];

  const changeDescription = analysisChanges.map((e) => describeChange(e, t)).find((d): d is string => Boolean(d));

  return (
    <View style={{ gap: 14, marginTop: 18, marginBottom: 24 }}>
      {/* PRIMARY: team-level conclusion — never a match win/draw/loss split, that's
          Match Analysis's job (see the product-boundary note at the top of this file's
          git history / commit message). */}
      <View style={styles.card}>
        <Text style={styles.sportMindViewKicker}>{t('insights.sportMindViewTitle')}</Text>
        <Text style={styles.trendHeadline}>{t(trendHeadlineKey)}</Text>
        <Text style={styles.aiAnalysisBody}>{synthesisBody}</Text>
        {squadCaveat && <Text style={[styles.aiAnalysisBody, { marginTop: 4 }]}>{squadCaveat}</Text>}
      </View>

      {signals.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('insights.teamSignalsTitle')}</Text>
          <View style={{ gap: 10 }}>
            {signals.map((s) => (
              <SignalRow key={s.key} label={signalLabel(s.key)} direction={s.dir} />
            ))}
            {unavailableCount > 0 && (
              <View style={styles.signalRow}>
                <Text style={styles.signalLabel}>{t('insights.signalLabelSquad')}</Text>
                <Text style={styles.squadStatusValue}>{t('insights.squadImpactSummary', { count: unavailableCount })}</Text>
              </View>
            )}
          </View>
          <View style={{ marginTop: 10 }}>
            <InfoToggle label={t('insights.teamSignalsInfoLabel')} explanation={t('insights.teamSignalsInfoBody')} />
          </View>
        </View>
      )}

      {hasSquadSection && (
        <View style={styles.card}>
          <Pressable style={styles.collapsibleHeader} onPress={() => setSquadExpanded((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: squadExpanded }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t('insights.squadStatusTitle')}</Text>
              <Text style={styles.mutedBody}>{squadSummaryParts.join(' · ')}</Text>
            </View>
            {squadExpanded ? <CaretUpIcon size={16} color={colors.textFainter} /> : <CaretDownIcon size={16} color={colors.textFainter} />}
          </Pressable>

          {squadExpanded && nextMatch && (
            <View style={{ gap: 14, marginTop: 12 }}>
              {unavailableCount > 0 && (
                <View style={{ gap: 16 }}>
                  <Text style={styles.squadGroupLabel}>{t('insights.unavailableGroupTitle')}</Text>
                  <View style={styles.squadTeamGroup}>
                    {ownSquad.map((entry, i) => (
                      <PlayerImpactRow key={`${entry.playerName}-${i}`} entry={entry} first={i === 0} />
                    ))}
                  </View>
                </View>
              )}

              {ownLineup.length > 0 && (
                <View style={{ gap: 14 }}>
                  <Text style={styles.squadGroupLabel}>{t('insights.keyPlayersGroupTitle')}</Text>
                  <Text style={styles.mutedBody}>{ownLineup.map((pl) => pl.name).join(', ')}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {nextMatch && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('insights.recentDevelopmentsTitle')}</Text>
          {hasAnyChange ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              {changeEvent && <Text style={styles.mutedBody}>{t('insights.predictionChangeLine', { from: changeEvent.from, to: changeEvent.to })}</Text>}
              {changeDescription && <Text style={styles.mutedBody}>{changeDescription}</Text>}
            </View>
          ) : (
            <Text style={[styles.mutedBody, { marginTop: 4 }]}>{t('insights.noSignificantChanges')}</Text>
          )}
        </View>
      )}

      {nextMatch?.h2h && nextMatch.h2h.totalMatches > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('insights.h2hTitle')}</Text>
          <Text style={[styles.mutedBody, { marginTop: 4 }]}>
            {t('insights.h2hRecord', {
              team: team.name,
              total: nextMatch.h2h.totalMatches,
              ownWins: isHomeInNextMatch ? nextMatch.h2h.homeWins : nextMatch.h2h.awayWins,
              draws: nextMatch.h2h.draws,
              oppWins: isHomeInNextMatch ? nextMatch.h2h.awayWins : nextMatch.h2h.homeWins,
            })}
          </Text>
        </View>
      )}

      {/* NEXT MATCH is contextual navigation only from here on — no prediction numbers.
          That detail lives in Match Analysis; this just links to it. */}
      {nextMatch ? (
        <Pressable style={styles.nextMatchCard} onPress={() => router.push(`/match/${nextMatch.id}`)}>
          <Text style={styles.nextMatchKicker}>{t('insights.nextMatchTitle')}</Text>
          <View style={styles.nextMatchRow}>
            <TeamBadgePair home={nextMatch.home} away={nextMatch.away} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.nextMatchTitle} numberOfLines={1}>
                {nextMatch.home.name} <Text style={styles.changeVs}>{t('common.vs')}</Text> {nextMatch.away.name}
              </Text>
              <Text style={styles.nextMatchSubtitle} numberOfLines={1}>
                {nextMatch.competition} · {nextMatch.kickoff}
              </Text>
            </View>
            <CaretRightIcon size={16} color={colors.textFainter} />
          </View>
          <View style={styles.viewFullAnalysisLink}>
            <Text style={styles.viewFullAnalysisText}>{t('common.viewFullAnalysis')}</Text>
            <ArrowRightIcon size={13} weight="bold" color={colors.primaryLink} />
          </View>
        </Pressable>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.followingEmptyText}>{t('insights.noUpcomingMatch', { team: team.name })}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 120, paddingTop: spacing.sm },
  title: { fontFamily: fonts.headline, fontSize: 26, letterSpacing: -0.6, color: colors.textPrimary, marginBottom: 16 },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textFaint, marginTop: 20, marginBottom: 6 },
  followingEmptyText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textFaint },
  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 180,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary, flexShrink: 1 },
  chipTextSelected: { color: colors.primaryTint },
  addChip: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderHover, alignItems: 'center', justifyContent: 'center' },
  addButton: { marginTop: 10, minHeight: 44, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderHover, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  addButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primaryLink },
  emptyCard: { marginTop: 14, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  card: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, marginBottom: 10 },
  sportMindViewKicker: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginBottom: 6 },
  trendHeadline: { fontFamily: fonts.headline, fontSize: 18, letterSpacing: -0.3, color: colors.textPrimary, marginBottom: 8 },
  aiAnalysisBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  mutedBody: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textFaint },
  signalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  signalLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  signalValue: { width: 24, alignItems: 'flex-end' },
  squadStatusValue: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  squadGroupLabel: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.textFainter },
  squadTeamGroup: { gap: 2 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  playerRowFirst: { borderTopWidth: 0, paddingTop: 0 },
  playerName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  playerStatus: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  impactChip: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  impactChipText: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  nextMatchCard: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  nextMatchKicker: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textFaint, marginBottom: 8 },
  nextMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextMatchTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  nextMatchSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  viewFullAnalysisLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  viewFullAnalysisText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primaryLink },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
  },
  changeMatchup: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary, marginBottom: 3 },
  changeVs: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFainter },
  changeDescription: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  deltaChip: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  deltaChipText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
});
