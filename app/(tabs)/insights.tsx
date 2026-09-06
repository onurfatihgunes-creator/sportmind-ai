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
import type { AnalysisChangeEvent, ChangeEvent, LineupPlayer, Match, MatchFactor, PlayerImpactEntry, Team } from '@/data/mockData';
import TeamPicker from '@/components/TeamPicker';
import TeamBadgePair from '@/components/TeamBadgePair';
import ConfidenceRing from '@/components/ConfidenceRing';
import StackedDistributionBar from '@/components/StackedDistributionBar';
import InfoToggle from '@/components/InfoToggle';
import Disclaimer from '@/components/Disclaimer';

/** Reframes a match's home/away outcome split from the selected team's own point of
 * view — "my team's win/draw/loss", not "home/draw/away" — matching how a
 * followed-team-centric screen should read regardless of which side that team is on. */
function perspective(match: Match, teamId: string) {
  const isHome = match.home.id === teamId;
  const opponent = isHome ? match.away : match.home;
  const winPct = isHome ? match.outcomes.home : match.outcomes.away;
  const lossPct = isHome ? match.outcomes.away : match.outcomes.home;
  return { isHome, opponent, winPct, drawPct: match.outcomes.draw, lossPct };
}

function factorsByStrength(factors: MatchFactor[]) {
  return [...factors].sort((a, b) => Math.abs(b.home - 50) - Math.abs(a.home - 50));
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

/** One real, human-readable "what changed" line for this match, built only from change
 * records that actually exist (prediction_changes' percentage delta and/or
 * analysis_changes' lineup/availability events) — never a fabricated reason. Prefers the
 * most recent event of each real kind rather than picking one arbitrarily. */
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

  const selectedMatch = useMemo(() => {
    if (!selectedTeam) return null;
    return matches.find((m) => m.home.id === selectedTeam.id || m.away.id === selectedTeam.id) ?? null;
  }, [matches, selectedTeam]);

  // Real Change Intelligence for this exact match only — combines both existing sources
  // (prediction_changes' win% delta, analysis_changes' lineup/availability events) rather
  // than picking one; each is shown only when it's real for this match.
  const matchChangeEvent = useMemo(
    () => (selectedMatch ? [...changeEvents].filter((e) => e.matchId === selectedMatch.id).sort((a, b) => b.id.localeCompare(a.id))[0] : undefined),
    [changeEvents, selectedMatch],
  );
  const matchAnalysisChanges = useMemo(
    () => (selectedMatch ? analysisChanges.filter((e) => e.matchId === selectedMatch.id) : []),
    [analysisChanges, selectedMatch],
  );
  const hasAnyChange = Boolean(matchChangeEvent) || matchAnalysisChanges.length > 0;

  // Followed-team changes surface first — a change on a match the user has no connection
  // to is still real Change Intelligence, but far less relevant than the state above it.
  const followedMatchIds = useMemo(() => new Set(matches.filter((m) => teamIds.includes(m.home.id) || teamIds.includes(m.away.id)).map((m) => m.id)), [matches, teamIds]);
  // Filtered to events whose match is actually in the currently-loaded set BEFORE
  // slicing — a change event can reference a match outside today's loaded window (e.g. a
  // different sport's top-30, or since aged out), and rendering would then have nothing
  // to show for it. Filtering first means an empty result here is a real "nothing to
  // show" rather than 5 slots that all silently render nothing with no empty-state
  // fallback.
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

        {selectedTeam && !selectedMatch && (
          <View style={styles.emptyCard}>
            <Text style={styles.followingEmptyText}>{t('insights.noUpcomingMatch', { team: selectedTeam.name })}</Text>
          </View>
        )}

        {selectedTeam && selectedMatch && (
          <SelectedTeamAnalysis
            team={selectedTeam}
            match={selectedMatch}
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

function factorDirection(factor: MatchFactor, isHome: boolean): 'up' | 'down' | 'neutral' {
  const diff = factor.home - 50;
  if (Math.abs(diff) <= 3) return 'neutral';
  const favoursHome = diff > 0;
  return (isHome ? favoursHome : !favoursHome) ? 'up' : 'down';
}

function SelectedTeamAnalysis({
  team,
  match,
  changeEvent,
  analysisChanges,
  hasAnyChange,
}: {
  team: Team;
  match: Match;
  changeEvent: ChangeEvent | undefined;
  analysisChanges: AnalysisChangeEvent[];
  hasAnyChange: boolean;
}) {
  const { t } = useTranslation();
  const [squadExpanded, setSquadExpanded] = useState(false);
  const isBasketball = match.sport === 'basketball';
  const p = perspective(match, team.id);
  const sortedFactors = factorsByStrength(match.factors);
  const topFactor = sortedFactors[0];

  // "Favoured"/the headline verdict is only ever said when this team's own win% genuinely
  // is the single largest of the three outcomes — otherwise (e.g. a 27% away underdog vs
  // a 46% home favourite) that word would overclaim. The real percentage is always shown
  // either way via the ring/bar below, never softened.
  const isFavoured = p.winPct >= p.drawPct && p.winPct >= p.lossPct;
  const headline = t(isFavoured ? 'insights.headlineFavoured' : 'insights.headlineUnderdog', { team: team.name });
  // Factor names stay in their own Title Case (matches factors.* elsewhere in the app) —
  // deliberately not lowercased for mid-sentence use, since German nouns are always
  // capitalized and lowercasing would be a real grammar error there, not a style choice.
  const aiAnalysis = topFactor
    ? t(isFavoured ? 'insights.aiAnalysisBody' : 'insights.aiAnalysisBodyUnderdog', { team: team.name, pct: p.winPct, factor: t(`factors.${topFactor.key}`) })
    : t(isFavoured ? 'insights.aiAnalysisFallbackBody' : 'insights.aiAnalysisFallbackBodyUnderdog', { team: team.name, pct: p.winPct });

  const homeSquad = (match.squadImpact ?? []).filter((e) => e.team === 'home');
  const awaySquad = (match.squadImpact ?? []).filter((e) => e.team === 'away');
  const unavailableCount = (match.squadImpact ?? []).length;
  const ownLineup: LineupPlayer[] = (p.isHome ? match.lineups?.home : match.lineups?.away) ?? [];
  const opponentLineup: LineupPlayer[] = (p.isHome ? match.lineups?.away : match.lineups?.home) ?? [];
  const hasSquadSection = unavailableCount > 0 || ownLineup.length > 0 || opponentLineup.length > 0;
  const squadSummaryParts = [
    unavailableCount > 0 ? t('insights.squadImpactSummary', { count: unavailableCount }) : null,
    ownLineup.length > 0 ? t('insights.keyPlayersTrackedSummary', { count: ownLineup.length }) : null,
  ].filter((part): part is string => Boolean(part));

  const changeDescription = analysisChanges.map((e) => describeChange(e, t)).find((d): d is string => Boolean(d));

  return (
    <View style={{ gap: 14, marginTop: 4, marginBottom: 24 }}>
      <Pressable style={styles.nextMatchCard} onPress={() => router.push(`/match/${match.id}`)}>
        <Text style={styles.nextMatchKicker}>{t('insights.nextMatchTitle')}</Text>
        <View style={styles.nextMatchRow}>
          <TeamBadgePair home={match.home} away={match.away} size={30} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.nextMatchTitle} numberOfLines={1}>
              {match.home.name} <Text style={styles.changeVs}>{t('common.vs')}</Text> {match.away.name}
            </Text>
            <Text style={styles.nextMatchSubtitle} numberOfLines={1}>
              {match.competition} · {match.kickoff}
            </Text>
          </View>
          <CaretRightIcon size={16} color={colors.textFainter} />
        </View>
      </Pressable>

      {/* PRIMARY: the conclusion comes before the numbers — a user should understand
          SportMind's verdict before being asked to interpret a percentage split. */}
      <View style={styles.card}>
        <Text style={styles.sportMindThinksHeadline}>{headline}</Text>
        <View style={styles.predictionRow}>
          <ConfidenceRing value={p.winPct} size={84} strokeWidth={7} caption={t('insights.winProbabilityCaption')} />
          <View style={{ flex: 1, gap: 8 }}>
            <StackedDistributionBar home={p.winPct} draw={isBasketball ? 0 : p.drawPct} away={p.lossPct} height={28} />
            <View style={styles.outcomeLegendRow}>
              <Text style={styles.outcomeLegendText}>{t('insights.win')}</Text>
              {!isBasketball && <Text style={styles.outcomeLegendText}>{t('insights.draw')}</Text>}
              <Text style={styles.outcomeLegendText}>{t('insights.loss')}</Text>
            </View>
          </View>
        </View>
        <InfoToggle label={t('insights.winProbabilityInfoLabel')} explanation={t('insights.winProbabilityInfoBody')} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('insights.aiAnalysisTitle')}</Text>
        <Text style={styles.aiAnalysisBody}>{aiAnalysis}</Text>
      </View>

      {sortedFactors.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{t('insights.whyTitle')}</Text>
          </View>
          <View style={{ gap: 10 }}>
            {sortedFactors.slice(0, 4).map((factor) => {
              const direction = factorDirection(factor, p.isHome);
              const Icon = direction === 'up' ? ArrowUpIcon : direction === 'down' ? ArrowDownIcon : ArrowRightIcon;
              const tone = direction === 'up' ? colors.successText : direction === 'down' ? colors.dangerText : colors.textFaint;
              return (
                <View key={factor.key} style={styles.whyRow}>
                  <Icon size={14} weight="bold" color={tone} />
                  <Text style={styles.whyLabel}>{t(`factors.${factor.key}`)}</Text>
                </View>
              );
            })}
          </View>
          <InfoToggle label={t('insights.whyInfoLabel')} explanation={t('insights.whyInfoBody')} />
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

          {squadExpanded && (
            <View style={{ gap: 14, marginTop: 12 }}>
              {unavailableCount > 0 && (
                <View style={{ gap: 8 }}>
                  <Text style={styles.squadGroupLabel}>{t('insights.unavailableGroupTitle')}</Text>
                  {[{ label: match.home.name, rows: homeSquad }, { label: match.away.name, rows: awaySquad }].map(
                    (group) =>
                      group.rows.length > 0 && (
                        <View key={group.label} style={{ gap: 6 }}>
                          <Text style={styles.squadTeamLabel}>{group.label}</Text>
                          {group.rows.map((entry, i) => (
                            <PlayerImpactRow key={`${entry.playerName}-${i}`} entry={entry} />
                          ))}
                        </View>
                      ),
                  )}
                </View>
              )}

              {(ownLineup.length > 0 || opponentLineup.length > 0) && (
                <View style={{ gap: 8 }}>
                  <Text style={styles.squadGroupLabel}>{t('insights.keyPlayersGroupTitle')}</Text>
                  {[{ label: team.name, rows: ownLineup }, { label: p.opponent.name, rows: opponentLineup }].map(
                    (group) =>
                      group.rows.length > 0 && (
                        <View key={group.label} style={{ gap: 4 }}>
                          <Text style={styles.squadTeamLabel}>{group.label}</Text>
                          <Text style={styles.mutedBody}>{group.rows.map((pl) => pl.name).join(', ')}</Text>
                        </View>
                      ),
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('whatChanged.title')}</Text>
        {hasAnyChange ? (
          <View style={{ gap: 8, marginTop: 8 }}>
            {changeEvent && (
              <Text style={styles.mutedBody}>
                {t('insights.predictionChangeLine', { from: changeEvent.from, to: changeEvent.to })}
              </Text>
            )}
            {changeDescription && <Text style={styles.mutedBody}>{changeDescription}</Text>}
          </View>
        ) : (
          <Text style={[styles.mutedBody, { marginTop: 8 }]}>{t('insights.noSignificantChanges')}</Text>
        )}
      </View>

      {match.h2h && match.h2h.totalMatches > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('insights.h2hTitle')}</Text>
          <Text style={[styles.mutedBody, { marginTop: 8 }]}>
            {t('insights.h2hRecord', {
              team: team.name,
              total: match.h2h.totalMatches,
              // BSD's H2H record is computed specific to this match's home/away
              // assignment, so "home wins" genuinely means "wins by the team that is
              // home in this fixture" — reframed to the selected team's own wins/losses
              // for consistency with the rest of this screen, same as the prediction.
              ownWins: p.isHome ? match.h2h.homeWins : match.h2h.awayWins,
              draws: match.h2h.draws,
              oppWins: p.isHome ? match.h2h.awayWins : match.h2h.homeWins,
            })}
          </Text>
        </View>
      )}

      <Pressable style={styles.viewFullAnalysisLink} onPress={() => router.push(`/match/${match.id}`)}>
        <Text style={styles.viewFullAnalysisText}>{t('common.viewFullAnalysis')}</Text>
        <ArrowRightIcon size={13} weight="bold" color={colors.primaryLink} />
      </Pressable>
    </View>
  );
}

function PlayerImpactRow({ entry }: { entry: PlayerImpactEntry }) {
  const { t } = useTranslation();
  const tone = entry.impact === 'high' ? 'danger' : entry.impact === 'medium' ? 'warning' : 'success';
  return (
    <View style={styles.playerRow}>
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
  nextMatchCard: { marginTop: 14, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  nextMatchKicker: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textFaint, marginBottom: 8 },
  nextMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextMatchTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  nextMatchSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  card: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, marginBottom: 10 },
  sportMindThinksHeadline: { fontFamily: fonts.headline, fontSize: 17, letterSpacing: -0.3, color: colors.textPrimary, marginBottom: 12 },
  predictionRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 10 },
  outcomeLegendRow: { flexDirection: 'row', justifyContent: 'space-between' },
  outcomeLegendText: { fontFamily: fonts.body, fontSize: 11, color: colors.textTertiaryAlt },
  aiAnalysisBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  mutedBody: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textFaint },
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  whyLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  squadGroupLabel: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.textFainter },
  squadTeamLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.textFaint },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  playerStatus: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 1 },
  impactChip: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  impactChipText: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  viewFullAnalysisLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
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
