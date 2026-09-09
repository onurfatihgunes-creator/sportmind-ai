import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretRightIcon,
  CaretUpIcon,
} from 'phosphor-react-native';
import { colors, fonts, radius, toneMutedColor, toneTextColor, type ChangeTone } from '@/constants/theme';
import type { AnalysisChangeEvent, LineupPlayer, Match, PlayerImpactEntry, Team } from '@/data/mockData';
import { getLatestSquadSnapshot, type SquadSnapshot } from '@/data/liveData';
import { hasTrustedFormSample } from '@/data/dataConfidence';
import TeamBadgePair from '@/components/TeamBadgePair';
import InfoToggle from '@/components/InfoToggle';
import SkeletonBlock from '@/components/SkeletonBlock';

const EMPTY_SNAPSHOT: SquadSnapshot = { unavailable: [], lineup: null, sourceMatchId: null };

type SignalDir = 'up' | 'down' | 'neutral';

/** Real, deterministic team-level FORM read from the team's own last-5 W/D/L —
 * mirrors the same kind of simple, documented threshold already used for player-impact
 * classification. undefined when there isn't a trustworthy sample yet — the same >=3-match
 * bar liveData.ts's attack/defence trend already requires (see data/dataConfidence.ts):
 * with only 1-2 matches this used to always fall through to 'neutral' (wins/losses could
 * never reach 3), which technically never overclaimed a direction but still rendered a
 * "Form" signal chip as if it were a real reading, alongside genuine 3+ match trends.
 * Requiring the same sample size here means Match Analysis's data-richness caveat and AI
 * Insights' form signal now agree on what "enough data" means for the same team. */
function formDirection(team: Team): SignalDir | undefined {
  if (!hasTrustedFormSample(team.form)) return undefined;
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

function LegendEntry({ Icon, tone, label }: { Icon: typeof ArrowUpIcon; tone: ChangeTone; label: string }) {
  const color = toneTextColor(tone);
  // The border is deliberately the SAME pale tone the chips already use as their own
  // fill (toneMutedColor) — confirmed live that toneColor still read as strong as a
  // real chip's border; a legend key competing with the chips it explains defeats the
  // point. Icon + text stay at full toneTextColor so the meaning is still unambiguous.
  return (
    <View style={[styles.legendEntry, { borderColor: toneMutedColor(tone) }]}>
      <Icon size={11} weight="bold" color={color} />
      <Text style={[styles.legendEntryText, { color }]}>{label}</Text>
    </View>
  );
}

function SignalChip({ label, direction }: { label: string; direction: SignalDir }) {
  const Icon = direction === 'up' ? ArrowUpIcon : direction === 'down' ? ArrowDownIcon : ArrowRightIcon;
  const tone = direction === 'up' ? 'success' : direction === 'down' ? 'danger' : 'neutral';
  const textColor = toneTextColor(tone);
  return (
    <View style={[styles.signalChip, { backgroundColor: toneMutedColor(tone) }]}>
      <Text style={[styles.signalChipText, { color: textColor }]}>{label}</Text>
      <Icon size={12} weight="bold" color={textColor} />
    </View>
  );
}

function Chip({ label, tone }: { label: string; tone: ChangeTone }) {
  return (
    <View style={[styles.smallChip, { backgroundColor: toneMutedColor(tone) }]}>
      <Text style={[styles.smallChipText, { color: toneTextColor(tone) }]}>{label}</Text>
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

/** The shared team-level intelligence content — SportMind View, Team Signals, Squad
 * Status, Player Status & Form, Recent Developments, Next Match. Used verbatim by both
 * the normal AI Insights tab (team chosen from the user's followed teams) and the
 * contextual Team Insights screen reached from Match Analysis (team chosen by route
 * param) — the two differ only in their surrounding shell/navigation, never in this
 * content or its underlying data derivation. Deliberately contains no H2H: H2H compares
 * two teams against each other and belongs to Match Analysis, not team-level intelligence. */
export default function TeamIntelligence({
  team,
  nextMatch,
  analysisChanges,
}: {
  team: Team;
  nextMatch: Match | null;
  analysisChanges: AnalysisChangeEvent[];
}) {
  const { t } = useTranslation();
  const [squadExpanded, setSquadExpanded] = useState(false);
  const [squadSnapshot, setSquadSnapshot] = useState<SquadSnapshot>(EMPTY_SNAPSHOT);
  const [squadLoading, setSquadLoading] = useState(true);

  // Team-first, not match-first: Squad Status and Player Status & Form reflect the
  // selected team's own latest real availability/lineup data, resolved independently of
  // whichever fixture is shown below as "Next Match" — confirmed live that a team's
  // chronologically-nearest match can have zero real data while a later one already does
  // (FC Barcelona's case), which used to make this content vanish for a team that
  // genuinely has real data. See getLatestSquadSnapshot's own doc comment for the exact
  // search priority. Re-fetched whenever the selected team changes; a stale in-flight
  // fetch for a since-abandoned team is discarded rather than applied.
  useEffect(() => {
    let cancelled = false;
    setSquadLoading(true);
    getLatestSquadSnapshot(team.id).then((snapshot) => {
      if (!cancelled) {
        setSquadSnapshot(snapshot);
        setSquadLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [team.id]);

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

  // Team-level, not match-level, and now not even next-match-level: these come from the
  // team-first resolver above, never from `nextMatch` — the opponent's players are Match
  // Analysis's concern regardless, and were never reachable here (the resolver's own
  // query is already scoped to this team's id).
  const ownSquad = squadSnapshot.unavailable;
  const unavailableCount = ownSquad.length;
  const ownLineup: LineupPlayer[] = squadSnapshot.lineup ?? [];
  const hasSquadSection = unavailableCount > 0 || ownLineup.length > 0;

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
  // A separate, more natural noun phrase for embedding inside a sentence ("attacking
  // performance") — kept distinct from the short chip label ("Attack") so the compact
  // Team Signals chips stay scannable while the SportMind View sentence still reads
  // naturally, in every locale.
  const signalPhrase = (key: 'form' | 'attack' | 'defence') => t(`insights.signalPhrase${key.charAt(0).toUpperCase()}${key.slice(1)}`);

  let synthesisBody: string;
  if (overallTrend === 'unknown') {
    synthesisBody = t('insights.teamViewInsufficientData', { team: team.name });
  } else if (overallTrend === 'positive' && topPositiveKey) {
    synthesisBody = t('insights.teamViewPositive', { team: team.name, signal: signalPhrase(topPositiveKey) });
  } else if (overallTrend === 'negative' && topNegativeKey) {
    synthesisBody = t('insights.teamViewNegative', { team: team.name, signal: signalPhrase(topNegativeKey) });
  } else if (overallTrend === 'mixed' && topPositiveKey && topNegativeKey) {
    synthesisBody = t('insights.teamViewMixed', { team: team.name, positive: signalPhrase(topPositiveKey), negative: signalPhrase(topNegativeKey) });
  } else {
    synthesisBody = t('insights.teamViewStable', { team: team.name });
  }

  const trendHeadlineKey = { positive: 'insights.trendPositive', negative: 'insights.trendNegative', mixed: 'insights.trendMixed', stable: 'insights.trendStable', unknown: 'insights.trendUnknown' }[overallTrend];

  // Team-scoped Change Intelligence only: a player-named event (ruled out / available
  // again) is included only when it's resolved to this team's own side (see
  // AnalysisChangeEvent.team's doc comment) — an event whose side couldn't be
  // determined is excluded rather than risked. Non-player lineup-status events carry no
  // team at all and are match-level, so they're always kept.
  const ownAnalysisChanges = analysisChanges.filter((e) => e.team === undefined || e.team === (isHomeInNextMatch ? 'home' : 'away'));
  const changeDescription = ownAnalysisChanges.map((e) => describeChange(e, t)).find((d): d is string => Boolean(d));

  return (
    <View style={{ gap: 14 }}>
      {/* PRIMARY: team-level conclusion — never a match win/draw/loss split, that's
          Match Analysis's job. Strongest visual identity on the page: a subtle
          purple/lilac tint, reserved for this one card. */}
      <View style={[styles.card, styles.sportMindCard]}>
        <View style={styles.sportMindKickerChip}>
          <Text style={styles.sportMindKickerChipText}>{t('insights.sportMindViewTitle')}</Text>
        </View>
        <Text style={styles.trendHeadline}>{t(trendHeadlineKey)}</Text>
        <Text style={styles.aiAnalysisBody}>{synthesisBody}</Text>
        {unavailableCount > 0 ? (
          <View style={{ marginTop: 10 }}>
            <Chip label={t('insights.squadUncertaintyChipLabel')} tone="warning" />
          </View>
        ) : squadLoading ? (
          <View style={{ marginTop: 10 }}>
            <SkeletonBlock width={130} />
          </View>
        ) : null}
      </View>

      {signals.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('insights.teamSignalsTitle')}</Text>
          <View style={styles.signalChipRow}>
            {signals.map((s) => (
              <SignalChip key={s.key} label={signalLabel(s.key)} direction={s.dir} />
            ))}
          </View>
          {/* The "N eksik oyuncu" chip already has its one home in the Player Status &
              Form card below (its own collapsed-header summary) — repeating it here
              said the same fact twice on one screen for no reason. */}
          {/* The colour + arrow alone don't say what "up"/"down" MEANS for a given
              signal on their own — confirmed by the person actually looking at this
              screen. A short legend spells out the one thing the chips assume the
              reader already knows. Right under the chips, ahead of the methodology
              toggle: it explains what's already on screen, "Bunlar nasıl belirleniyor?"
              is the deeper, optional explanation and reads as the card's true last word. */}
          <View style={styles.legendDivider} />
          <Text style={styles.legendCaption}>{t('insights.signalLegendCaption')}</Text>
          <View style={styles.signalLegendRow}>
            <LegendEntry Icon={ArrowUpIcon} tone="success" label={t('insights.signalLegendPositive')} />
            <LegendEntry Icon={ArrowDownIcon} tone="danger" label={t('insights.signalLegendNegative')} />
            <LegendEntry Icon={ArrowRightIcon} tone="neutral" label={t('insights.signalLegendNeutral')} />
          </View>
          <View style={{ marginTop: 12 }}>
            <InfoToggle label={t('insights.teamSignalsInfoLabel')} explanation={t('insights.teamSignalsInfoBody')} />
          </View>
        </View>
      )}

      {/* PLAYER STATUS & FORM — secondary to Team Signals, collapsed by
          default. Real players only (name, real status, humanized real reason, real
          impact) — never a fabricated form label (Strong/Stable/Weak/etc.), matching the
          standing audit decision that no data path supports a genuine per-player form
          rating. Shows an honest empty state rather than disappearing when this match has
          no real availability/lineup data at all. */}
      <View style={styles.card}>
        {hasSquadSection ? (
          <>
            <Pressable style={styles.collapsibleHeader} onPress={() => setSquadExpanded((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: squadExpanded }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.cardTitle}>{t('insights.squadStatusTitle')}</Text>
                <View style={styles.collapsedSummaryRow}>
                  {unavailableCount > 0 && <Chip label={t('insights.squadImpactSummary', { count: unavailableCount })} tone="warning" />}
                  {ownLineup.length > 0 && <Text style={styles.mutedBody}>{t('insights.keyPlayersTrackedSummary', { count: ownLineup.length })}</Text>}
                </View>
              </View>
              {squadExpanded ? <CaretUpIcon size={16} color={colors.textFainter} /> : <CaretDownIcon size={16} color={colors.textFainter} />}
            </Pressable>

            {squadExpanded && (
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
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>{t('insights.squadStatusTitle')}</Text>
            {squadLoading ? (
              <SkeletonBlock width="70%" height={14} radius={4} />
            ) : (
              <Text style={styles.mutedBody}>{t('insights.playerStatusEmptyState')}</Text>
            )}
          </>
        )}
      </View>

      {nextMatch && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('insights.recentDevelopmentsTitle')}</Text>
          <View style={{ gap: 8, marginTop: 4 }}>
            {changeDescription ? (
              <>
                <Chip label={t('insights.developmentTagSquad')} tone="info" />
                <Text style={styles.mutedBody}>{changeDescription}</Text>
              </>
            ) : (
              <>
                <Chip label={t('insights.developmentTagStable')} tone="neutral" />
                <Text style={styles.mutedBody}>{t('insights.noSignificantChanges')}</Text>
              </>
            )}
          </View>
        </View>
      )}

      {/* NEXT MATCH is contextual navigation only from here on — no prediction numbers.
          That detail lives in Match Analysis; this just links to it. */}
      {nextMatch ? (
        <Pressable style={styles.nextMatchCard} onPress={() => router.push(`/match/${nextMatch.id}`)}>
          <View style={styles.nextMatchHeaderRow}>
            <Text style={styles.nextMatchKicker}>{t('insights.nextMatchTitle')}</Text>
            <Chip label={nextMatch.competition} tone="neutral" />
          </View>
          <View style={styles.nextMatchRow}>
            <TeamBadgePair home={nextMatch.home} away={nextMatch.away} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.nextMatchTitle} numberOfLines={1}>
                {nextMatch.home.name} <Text style={styles.changeVs}>{t('common.vs')}</Text> {nextMatch.away.name}
              </Text>
              <Text style={styles.nextMatchSubtitle} numberOfLines={1}>
                {nextMatch.kickoff}
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
          <Text style={styles.emptyText}>{t('insights.noUpcomingMatch', { team: team.name })}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyCard: { padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  emptyText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textFaint },
  card: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, marginBottom: 10 },
  sportMindCard: { backgroundColor: colors.primaryTint, borderColor: colors.borderAccent },
  sportMindKickerChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryTintStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  sportMindKickerChipText: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.primaryText },
  trendHeadline: { fontFamily: fonts.headline, fontSize: 18, letterSpacing: -0.3, color: colors.textPrimary, marginBottom: 8 },
  aiAnalysisBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  mutedBody: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textFaint },
  signalChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  signalChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  signalChipText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  legendDivider: { height: 1, backgroundColor: colors.divider, marginTop: 12, marginBottom: 10 },
  legendCaption: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textFainter,
    marginBottom: 8,
  },
  signalLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  legendEntryText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  smallChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  smallChipText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  collapsedSummaryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
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
  nextMatchHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  nextMatchKicker: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textFaint },
  nextMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextMatchTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  nextMatchSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  changeVs: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFainter },
  viewFullAnalysisLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  viewFullAnalysisText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primaryLink },
});
